import { withCache } from "ultrafetch";

class TTLCache extends Map<string, string> {
  #timers = new Map();

  set(k: string, v: string, { ttl = 60 * 1000 }: { ttl?: number } = {}) {
    if (this.#timers.has(k)) {
      clearTimeout(this.#timers.get(k));
    }
    this.#timers.set(
      k,
      setTimeout(() => this.delete(k), ttl)
    );
    return super.set(k, v);
  }

  delete(k: string) {
    if (this.#timers.has(k)) {
      clearTimeout(this.#timers.get(k));
    }
    this.#timers.delete(k);
    return super.delete(k);
  }

  clear() {
    super.clear();
    for (const v of this.#timers.values()) {
      clearTimeout(v);
    }
    this.#timers.clear();
  }
}

const enhancedFetch = withCache(fetch, { cache: new TTLCache() });
export default enhancedFetch;
