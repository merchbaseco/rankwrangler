import type { BSRCache, BSRInfo, CachedBSR } from '../types';

export class CacheService {
    private static instance: CacheService;
    private readonly CACHE_KEY = 'bsrCache';
    private readonly CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

    static getInstance(): CacheService {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }

    /**
     * Retrieves cached BSR data for a given ASIN
     * @param asin - Product ASIN
     * @returns Cached BSR data or null if not found/expired
     */
    async getCached(asin: string) {
        try {
            const result = await chrome.storage.local.get([this.CACHE_KEY]);
            const cache = result[this.CACHE_KEY] || {};
            const cachedData = cache[asin];

            if (!cachedData) {
                return null;
            }

            // Check if cache is still valid
            if (this.isExpired(cachedData.timestamp)) {
                // Cache expired, remove it
                await this.removeCached(asin);
                return null;
            }

            return cachedData;
        } catch (error) {
            console.error('CacheService.getCached error:', error);
            return null;
        }
    }

    /**
     * Stores BSR information in cache
     * @param asin - Product ASIN
     * @param bsrInfo - BSR information to cache
     */
    async setCached(asin: string, bsrInfo: BSRInfo) {
        try {
            const result = await chrome.storage.local.get([this.CACHE_KEY]);
            const cache = result[this.CACHE_KEY] || {};

            cache[asin] = {
                ...bsrInfo,
                timestamp: Date.now(),
            };

            await chrome.storage.local.set({ [this.CACHE_KEY]: cache });
        } catch (error) {
            console.error('CacheService.setCached error:', error);
            throw error;
        }
    }

    /**
     * Removes a specific ASIN from cache
     * @param asin - Product ASIN to remove
     */
    async removeCached(asin: string) {
        try {
            const result = await chrome.storage.local.get([this.CACHE_KEY]);
            const cache = result[this.CACHE_KEY] || {};

            if (cache[asin]) {
                delete cache[asin];
                await chrome.storage.local.set({ [this.CACHE_KEY]: cache });
            }
        } catch (error) {
            console.error('CacheService.removeCached error:', error);
        }
    }

    /**
     * Clears all cached BSR data
     */
    async clearCache() {
        try {
            await chrome.storage.local.set({ [this.CACHE_KEY]: {} });
        } catch (error) {
            console.error('CacheService.clearCache error:', error);
            throw error;
        }
    }

    /**
     * Gets all cached ASINs (for debugging/stats)
     */
    async getAllCachedAsins() {
        try {
            const result = await chrome.storage.local.get([this.CACHE_KEY]);
            const cache = result[this.CACHE_KEY] || {};
            return Object.keys(cache);
        } catch (error) {
            console.error('CacheService.getAllCachedAsins error:', error);
            return [];
        }
    }

    /**
     * Gets cache statistics
     */
    async getCacheStats() {
        try {
            const result = await chrome.storage.local.get([this.CACHE_KEY]);
            const cache = result[this.CACHE_KEY] || {};

            let totalCached = 0;
            let expiredCount = 0;

            for (const asin in cache) {
                totalCached++;
                if (this.isExpired(cache[asin].timestamp)) {
                    expiredCount++;
                }
            }

            return { totalCached, expiredCount };
        } catch (error) {
            console.error('CacheService.getCacheStats error:', error);
            return { totalCached: 0, expiredCount: 0 };
        }
    }

    /**
     * Checks if a timestamp is expired
     * @param timestamp - Timestamp to check
     * @returns True if expired, false otherwise
     */
    private isExpired(timestamp: number) {
        return Date.now() - timestamp > this.CACHE_DURATION;
    }
}
