/**
 * A small per-process memo for expensive aggregate reads: one in-flight or settled promise per
 * key for `ttlMs`, at most `maxEntries` keys (oldest evicted first). A rejected read is dropped
 * at once so the next caller retries.
 */
export const createTtlCache = <T>({ ttlMs, maxEntries }: { ttlMs: number; maxEntries: number }) => {
    const entries = new Map<string, { expiresAt: number; value: Promise<T> }>();
    return (key: string, load: () => Promise<T>, now = Date.now()): Promise<T> => {
        const cached = entries.get(key);
        if (cached && cached.expiresAt > now) return cached.value;
        entries.delete(key);
        const value = load();
        entries.set(key, { expiresAt: now + ttlMs, value });
        value.catch(() => {
            if (entries.get(key)?.value === value) entries.delete(key);
        });
        while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            entries.delete(oldest);
        }
        return value;
    };
};
