export interface CacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  maxPending?: number;
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
export const SEARCH_CACHE_MAX_ENTRIES = 500;
export const SEARCH_CACHE_MAX_PENDING = 20;

export class CatalogCacheBusyError extends Error {
  constructor() {
    super('Catalog search capacity exceeded.');
    this.name = 'CatalogCacheBusyError';
  }
}

export class CatalogCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly pending = new Map<string, Promise<T>>();

  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxPending: number;
  private readonly now: () => number;

  constructor(options: CacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? SEARCH_CACHE_TTL_MS;
    this.maxEntries = options.maxEntries ?? SEARCH_CACHE_MAX_ENTRIES;
    this.maxPending = options.maxPending ?? SEARCH_CACHE_MAX_PENDING;
    this.now = options.now ?? Date.now;

    if (
      !Number.isFinite(this.ttlMs) ||
      this.ttlMs <= 0 ||
      !Number.isSafeInteger(this.maxEntries) ||
      this.maxEntries < 1 ||
      !Number.isSafeInteger(this.maxPending) ||
      this.maxPending < 1
    ) {
      throw new TypeError('Invalid catalog cache configuration.');
    }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) return undefined;

    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    // Actualizar el orden para aplicar LRU.
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);

    this.entries.set(key, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;

      if (oldestKey === undefined) break;

      this.entries.delete(oldestKey);
    }
  }

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const existing = this.pending.get(key);

    if (existing) {
      return existing;
    }

    if (this.pending.size >= this.maxPending) {
      throw new CatalogCacheBusyError();
    }

    const operation = Promise.resolve()
      .then(loader)
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, operation);

    return operation;
  }

  clear(): void {
    this.entries.clear();
    this.pending.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
