import { usersCollection, agentsCollection } from '../db.js';

class ApiKeyService {
  private keyPool: string[] = [];
  private currentPoolIndex = 0;
  // Track cooldowns for rate-limited keys. Map<apiKey, unlockTimestamp>
  private cooldowns = new Map<string, number>();
  private keyUsage = new Map<string, number>();

  constructor() {
    console.log('[ApiKeyService] Initialized.');
  }

    public async initialize(): Promise<void> {
    try {
      // Use a Set to automatically handle duplicates
      const keySet = new Set<string>();

      // 1. Load keys from user profiles in the database
      const usersWithKeys = await usersCollection.find(
        { userApiKey: { $exists: true, $nin: [null, ''] } },
        { projection: { userApiKey: 1 } }
      ).toArray();

      usersWithKeys.forEach(u => {
        if (u.userApiKey) keySet.add(u.userApiKey);
      });

      // 2. Scan environment variables for all GEMINI_API_KEYs
      for (const key in process.env) {
        if (key.startsWith('GEMINI_API_KEY') && process.env[key]) {
          keySet.add(process.env[key] as string);
        }
      }

      this.keyPool = Array.from(keySet);

      if (this.keyPool.length > 0) {
        console.log(`[ApiKeyService] Successfully loaded ${this.keyPool.length} unique API keys into the pool.`);
      } else {
        console.warn('[ApiKeyService] No API keys were loaded into the pool. The system will rely on a single fallback key if available.');
      }
    } catch (error) {
      console.error('[ApiKeyService] Failed to initialize API key pool:', error);
      this.keyPool = [];
    }
  }


  private async getNextKeyFromPool(): Promise<string | null> {
    if (this.keyPool.length === 0) {
      return null;
    }

    // Use an iterative loop to be more explicit and avoid deep recursion.
    while (true) {
      const now = Date.now();
      const initialIndex = this.currentPoolIndex;

      // Attempt to find an available key in a single pass.
      do {
        const key = this.keyPool[this.currentPoolIndex];
        this.currentPoolIndex = (this.currentPoolIndex + 1) % this.keyPool.length;

        const unlockTime = this.cooldowns.get(key);
        if (!unlockTime || now > unlockTime) {
          if (unlockTime) this.cooldowns.delete(key); // Clear expired cooldown

          // Proactive rotation logic
          const currentUsage = (this.keyUsage.get(key) || 0) + 1;
          this.keyUsage.set(key, currentUsage);

          if (currentUsage >= 5) {
            this.keyUsage.set(key, 0); // Reset usage count
            this.cooldowns.set(key, Date.now() + 1); // 1ms cooldown to force rotation
            console.log(`[ApiKeyService] Proactively rotating key ending in ...${key.slice(-4)} after 5 uses.`);
          }

          return key; // Found a valid key.
        }
      } while (this.currentPoolIndex !== initialIndex);

      // If we complete a full loop and find no key, all are on cooldown.
      console.warn('[ApiKeyService] All keys in the pool are currently on cooldown. Waiting for the next available key...');
      const nextAvailableTime = Math.min(...Array.from(this.cooldowns.values()));
      const waitTime = nextAvailableTime - Date.now();

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      // Loop will continue, and we'll retry finding a key.
    }
  }

  public reportRateLimit(key: string, durationSeconds = 15) {
    const unlockTime = Date.now() + durationSeconds * 1000;
    this.cooldowns.set(key, unlockTime);
    this.keyUsage.set(key, 0); // Reset usage count on a hard rate limit
    console.log(`[ApiKeyService] Key ending in ...${key.slice(-4)} put on cooldown for ${durationSeconds}s.`);
  }
  
  public areAllKeysOnCooldown(): boolean {
    if (this.keyPool.length === 0) {
      return false; // No keys in pool, so technically none are on cooldown
    }
    
    const now = Date.now();
    // Check if all keys are on cooldown
    return this.keyPool.every(key => {
      const unlockTime = this.cooldowns.get(key);
      return unlockTime && now < unlockTime;
    });
  }

  public async getKeyForAgent(agentId: string): Promise<string | null> {
    const agent = await agentsCollection.findOne({ id: agentId });
    if (!agent) {
        console.warn(`[ApiKeyService] Could not find agent with ID: ${agentId}`);
        return process.env.GEMINI_API_KEY || null;
    }

    const now = Date.now();
    
    // Check if this is a user-created agent or an MCP
    const isUserAgent = !!agent.ownerHandle;
    
    if (isUserAgent) {
        // For user agents: Try to use the owner's API key first
        const owner = await usersCollection.findOne({ handle: agent.ownerHandle });
        if (owner && owner.userApiKey) {
            const unlockTime = this.cooldowns.get(owner.userApiKey);
            if (!unlockTime || now > unlockTime) {
                // Owner's key is available and not on cooldown
                if (unlockTime) this.cooldowns.delete(owner.userApiKey);
                console.log(`[ApiKeyService] Using owner's key for agent ${agent.name} (${agent.ownerHandle}).`);
                return owner.userApiKey;
            }
            // Owner's key is on cooldown, log and fall through to pool as fallback
            console.log(`[ApiKeyService] Owner key for agent ${agent.name} is on cooldown. Attempting to use pool key as fallback.`);
        } else {
            console.log(`[ApiKeyService] No owner key found for user agent ${agent.name}. Falling back to pool.`);
        }
    } else {
        // For MCPs: Log that we're using a pool key
        console.log(`[ApiKeyService] MCP agent ${agent.name} requesting key from pool.`);
    }

    // For MCPs or as fallback for user agents: use a key from the pool
    const keyFromPool = await this.getNextKeyFromPool();
    
    if (keyFromPool) {
        console.log(`[ApiKeyService] Using pool key for agent ${agent.name}.`);
    } else {
        console.warn(`[ApiKeyService] No pool key available for agent ${agent.name}. Using global fallback key.`);
    }

    // Final fallback to the server's global key if the pool is exhausted
    return keyFromPool || process.env.GEMINI_API_KEY || null;
  }
}

export const apiKeyService = new ApiKeyService();