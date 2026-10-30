import { describe, expect, it } from 'bun:test';
import { createSwrCache } from './swr-cache';

describe('createSwrCache', () => {
    it('serves a fresh value without reloading', async () => {
        const cache = createSwrCache<number>({ freshMs: 100, staleMs: 1_000, maxEntries: 10 });
        let loads = 0;
        const load = async () => ++loads;
        expect(await cache('k', load, 0)).toBe(1);
        expect(await cache('k', load, 50)).toBe(1);
        expect(loads).toBe(1);
    });

    it('serves a stale value at once and refreshes it once in the background', async () => {
        const cache = createSwrCache<number>({ freshMs: 100, staleMs: 1_000, maxEntries: 10 });
        let loads = 0;
        let release = () => {};
        const load = () => {
            loads += 1;
            const value = loads;
            return loads === 1
                ? Promise.resolve(value)
                : new Promise<number>(resolve => {
                      release = () => resolve(value);
                  });
        };
        expect(await cache('k', load, 0)).toBe(1);
        expect(await cache('k', load, 200)).toBe(1);
        expect(await cache('k', load, 210)).toBe(1);
        expect(loads).toBe(2);
        release();
        await Promise.resolve();
        await Promise.resolve();
        expect(await cache('k', load, 220)).toBe(2);
    });

    it('reloads in line once a value is older than the stale window', async () => {
        const cache = createSwrCache<number>({ freshMs: 100, staleMs: 100, maxEntries: 10 });
        let loads = 0;
        const load = async () => ++loads;
        await cache('k', load, 0);
        expect(await cache('k', load, 500)).toBe(2);
    });

    it('keeps the previous value when a background refresh fails', async () => {
        const cache = createSwrCache<number>({ freshMs: 100, staleMs: 1_000, maxEntries: 10 });
        await cache('k', async () => 1, 0);
        expect(await cache('k', () => Promise.reject(new Error('down')), 200)).toBe(1);
        await Promise.resolve();
        await Promise.resolve();
        expect(await cache('k', async () => 3, 300)).toBe(1);
    });

    it('drops a failed first load so the next caller retries', async () => {
        const cache = createSwrCache<number>({ freshMs: 100, staleMs: 1_000, maxEntries: 10 });
        await expect(cache('k', () => Promise.reject(new Error('down')), 0)).rejects.toThrow('down');
        expect(await cache('k', async () => 2, 1)).toBe(2);
    });
});
