import { usersCollection } from '../db.js';

class ApiKeyService {
  private keys: string[] = [];
  private currentIndex = 0;

  constructor() {
    console.log('[ApiKeyService] Initialized.');
  }

  /**
   * Loads all available user API keys from the database into an in-memory pool.
   * This should be called once on server startup.
   */
  public async initialize(): Promise<void> {
    try {
      // FIX: Corrected an object literal error. An object cannot have duplicate keys (e.g., two `$ne` properties). The query is updated to use the correct `$nin` (not in) operator to check for multiple invalid values.
      const usersWithKeys = await usersCollection.find(
        { userApiKey: { $exists: true, $nin: [null, ''] } },
        { projection: { userApiKey: 1 } }
      ).toArray();

      // In a real production environment, these keys should be encrypted at rest
      // and decrypted here before being added to the pool.
      this.keys = usersWithKeys.map(u => u.userApiKey).filter((k): k is string => !!k);
      
      console.log(`[ApiKeyService] Successfully loaded ${this.keys.length} API keys into the pool.`);
    } catch (error) {
      console.error('[ApiKeyService] Failed to initialize API key pool:', error);
      this.keys = [];
    }
  }

  /**
   * Retrieves the next API key from the pool using a round-robin strategy.
   * @returns The next API key as a string, or null if the pool is empty.
   */
  public getNextKey(): string | null {
    if (this.keys.length === 0) {
      return null;
    }

    const key = this.keys[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    
    return key;
  }
}

export const apiKeyService = new ApiKeyService();