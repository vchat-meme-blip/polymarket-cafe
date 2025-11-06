/// <reference types="node" />

export class ApiKeyManager {
  private keys: string[];
  private cooldowns = new Map<string, number>();

  constructor() {
    this.keys = (process.env.OPENAI_API_KEYS || '')
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    
    if (this.keys.length === 0) {
      console.warn('[ApiKeyManager] No OPENAI_API_KEYS found in environment. AI features will be limited.');
    } else {
      console.log(`[ApiKeyManager] Loaded ${this.keys.length} OpenAI API keys.`);
    }
  }

  public getKey(): string | null {
    const now = Date.now();
    const availableKeys = this.keys.filter(key => {
      const cooldownEnd = this.cooldowns.get(key);
      return !cooldownEnd || now > cooldownEnd;
    });

    if (availableKeys.length === 0) {
      console.warn('[ApiKeyManager] All API keys are currently on cooldown.');
      return null;
    }

    // Simple random selection
    const key = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    return key;
  }

  public reportRateLimit(key: string, durationSeconds: number) {
    const cooldownEnd = Date.now() + durationSeconds * 1000;
    this.cooldowns.set(key, cooldownEnd);
    console.log(`[ApiKeyManager] Key ${key.slice(0, 8)}... put on cooldown for ${durationSeconds}s.`);
  }

  public areAllKeysOnCooldown(): boolean {
    if (this.keys.length === 0) return true;
    const now = Date.now();
    return this.keys.every(key => {
        const cooldownEnd = this.cooldowns.get(key);
        return cooldownEnd && now < cooldownEnd;
    });
  }
}
