// tiny in-memory cache + rate limiter for provider lookups.
// on vercel each function instance has its own memory, so this is best-effort, which is fine:
// it only saves repeat calls (and rentcast's 50/month free quota), it is not a security control.

interface Entry<T> {
    value: T;
    expires: number;
}

export class TtlCache<T> {
    private store = new Map<string, Entry<T>>();
    private ttlMs: number;
    private maxEntries: number;

    constructor(ttlMs: number, maxEntries = 500) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
    }

    get(key: string): T | undefined {
        const hit = this.store.get(key);
        if (!hit) return undefined;
        if (hit.expires < Date.now()) {
            this.store.delete(key);
            return undefined;
        }
        return hit.value;
    }

    set(key: string, value: T) {
        if (this.store.size >= this.maxEntries) {
            // drop the oldest entry (maps keep insertion order)
            const oldest = this.store.keys().next().value;
            if (oldest !== undefined) this.store.delete(oldest);
        }
        this.store.set(key, { value, expires: Date.now() + this.ttlMs });
    }
}

// allow `limit` calls per `windowMs` per key
export function makeRateLimiter(limit: number, windowMs: number) {
    const hits = new Map<string, number[]>();
    return (key: string): boolean => {
        const now = Date.now();
        const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
        if (recent.length >= limit) {
            hits.set(key, recent);
            return false;
        }
        recent.push(now);
        hits.set(key, recent);
        return true;
    };
}
