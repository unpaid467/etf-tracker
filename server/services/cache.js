/**
 * Simple in-memory cache with per-entry TTL.
 * Swap this out for Redis/Memcached to scale horizontally.
 */
class Cache {
  constructor() {
    this._store = new Map();
  }

  set(key, value, ttlMs) {
    this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this._store.delete(key);
  }

  clear() {
    this._store.clear();
  }

  get size() {
    return this._store.size;
  }
}

export default new Cache();
