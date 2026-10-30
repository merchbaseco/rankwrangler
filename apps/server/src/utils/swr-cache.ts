/**
 * A small per-process stale-while-revalidate memo for expensive aggregate reads. A value is fresh
 * for `freshMs`; after that, and until `staleMs` more have passed, callers get the stored value at
 * once while one background load replaces it. Older values are reloaded in line. One in-flight
 * load per key; a failed load keeps the previous value (or is dropped so the next caller retries).
 * At most `maxEntries` keys, least recently written evicted first. `runRefresh` wraps background
 * loads, so work no caller waits on can run apart from the requests that are waiting.
 */
export const createSwrCache = <T>({
    freshMs,
    staleMs,
    maxEntries,
    runRefresh = work => work(),
}: {
    freshMs: number;
    staleMs: number;
    maxEntries: number;
    runRefresh?: (work: () => Promise<T>) => Promise<T>;
}) => {
    const entries = new Map<string, { loadedAt: number; value: Promise<T>; refreshing: boolean }>();
    const store = (key: string, load: () => Promise<T>, now: number, previous?: Promise<T>) => {
        const value = load();
        const entry = { loadedAt: now, value: previous ?? value, refreshing: previous !== undefined };
        entries.delete(key);
        entries.set(key, entry);
        value.then(
            () => {
                if (entries.get(key) === entry) {
                    entries.set(key, { loadedAt: now, value, refreshing: false });
                }
            },
            () => {
                if (entries.get(key) !== entry) return;
                if (previous) entries.set(key, { ...entry, refreshing: false });
                else entries.delete(key);
            }
        );
        while (entries.size > maxEntries) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined) break;
            entries.delete(oldest);
        }
        return entry.value;
    };
    return (key: string, load: () => Promise<T>, now = Date.now()): Promise<T> => {
        const cached = entries.get(key);
        const age = cached ? now - cached.loadedAt : Number.POSITIVE_INFINITY;
        if (cached && (age < freshMs || cached.refreshing)) return cached.value;
        if (cached && age < freshMs + staleMs) {
            return store(key, () => runRefresh(load), now, cached.value);
        }
        return store(key, load, now);
    };
};
