import type { 
  BSRCache, 
  CachedBSR, 
  BSRInfo
} from '../types';

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
  async getCached(asin: string): Promise<CachedBSR | null> {
    try {
      const result = await chrome.storage.local.get([this.CACHE_KEY]);
      const cache: BSRCache = result[this.CACHE_KEY] || {};
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
  async setCached(asin: string, bsrInfo: BSRInfo): Promise<void> {
    try {
      const result = await chrome.storage.local.get([this.CACHE_KEY]);
      const cache: BSRCache = result[this.CACHE_KEY] || {};

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
  async removeCached(asin: string): Promise<void> {
    try {
      const result = await chrome.storage.local.get([this.CACHE_KEY]);
      const cache: BSRCache = result[this.CACHE_KEY] || {};

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
  async clearCache(): Promise<void> {
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
  async getAllCachedAsins(): Promise<string[]> {
    try {
      const result = await chrome.storage.local.get([this.CACHE_KEY]);
      const cache: BSRCache = result[this.CACHE_KEY] || {};
      return Object.keys(cache);
    } catch (error) {
      console.error('CacheService.getAllCachedAsins error:', error);
      return [];
    }
  }

  /**
   * Gets cache statistics
   */
  async getCacheStats(): Promise<{ totalCached: number; expiredCount: number }> {
    try {
      const result = await chrome.storage.local.get([this.CACHE_KEY]);
      const cache: BSRCache = result[this.CACHE_KEY] || {};
      
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
   * Cleanup expired cache entries
   */
  async cleanupExpired(): Promise<number> {
    try {
      const result = await chrome.storage.local.get([this.CACHE_KEY]);
      const cache: BSRCache = result[this.CACHE_KEY] || {};
      
      let removedCount = 0;
      const cleanedCache: BSRCache = {};

      for (const asin in cache) {
        if (!this.isExpired(cache[asin].timestamp)) {
          cleanedCache[asin] = cache[asin];
        } else {
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await chrome.storage.local.set({ [this.CACHE_KEY]: cleanedCache });
      }

      return removedCount;
    } catch (error) {
      console.error('CacheService.cleanupExpired error:', error);
      return 0;
    }
  }

  /**
   * Checks if a timestamp is expired
   * @param timestamp - Timestamp to check
   * @returns True if expired, false otherwise
   */
  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.CACHE_DURATION;
  }
}