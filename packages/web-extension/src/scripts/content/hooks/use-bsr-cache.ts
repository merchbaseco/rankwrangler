import { useCallback } from 'react';
import type { BSRInfo, CachedBSR } from '../types';

const CACHE_KEY = 'bsrCache';
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

export function useBSRCache() {
    const getCached = useCallback(async (asin: string): Promise<CachedBSR | null> => {
        const result = await chrome.storage.local.get([CACHE_KEY]);
        const cache = result[CACHE_KEY] || {};
        const cachedData = cache[asin];

        if (!cachedData) {
            return null;
        }

        // Check if cache is expired
        if (Date.now() - cachedData.timestamp > CACHE_DURATION) {
            // Cache expired, remove it
            delete cache[asin];
            await chrome.storage.local.set({ [CACHE_KEY]: cache });
            return null;
        }

        return cachedData;
    }, []);

    const setCached = useCallback(async (asin: string, bsrInfo: BSRInfo): Promise<void> => {
        const result = await chrome.storage.local.get([CACHE_KEY]);
        const cache = result[CACHE_KEY] || {};

        cache[asin] = {
            ...bsrInfo,
            timestamp: Date.now(),
        };

        await chrome.storage.local.set({ [CACHE_KEY]: cache });
    }, []);

    const clearCache = useCallback(async (): Promise<void> => {
        await chrome.storage.local.set({ [CACHE_KEY]: {} });
    }, []);

    return {
        getCached,
        setCached,
        clearCache,
    };
}