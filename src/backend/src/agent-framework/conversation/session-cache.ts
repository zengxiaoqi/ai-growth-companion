/**
 * Session cache with TTL and size limit.
 * Replaces the raw Map<string, ActiveSession> in ConversationManager.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SessionCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number = 30 * 60 * 1000, // 30 minutes default
    private readonly maxSize: number = 1000,
  ) {}

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict expired entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictExpired();
      // If still at capacity after eviction, remove the oldest entry
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  get size(): number {
    return this.cache.size;
  }

  /** Remove all expired entries */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /** Clear all entries */
  clear(): void {
    this.cache.clear();
  }
}
