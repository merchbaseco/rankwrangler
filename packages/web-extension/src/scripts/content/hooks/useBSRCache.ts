import { useCallback } from 'react';
import { CacheService } from '../services/cache';
import type { BSRInfo, CachedBSR } from '../types';

/**
 * Hook for managing BSR cache operations
 * Provides methods to get, set, and clear cached BSR data
 */
export function useBSRCache() {
    const cacheService = CacheService.getInstance();

    const getCached = useCallback(
        async (asin: string): Promise<CachedBSR | null> => {
            try {
                return await cacheService.getCached(asin);
            } catch (error) {
                console.error('useBSRCache.getCached error:', error);
                return null;
            }
        },
        [cacheService]
    );

    const setCached = useCallback(
        async (asin: string, bsrInfo: BSRInfo): Promise<void> => {
            try {
                await cacheService.setCached(asin, bsrInfo);
            } catch (error) {
                console.error('useBSRCache.setCached error:', error);
                throw error;
            }
        },
        [cacheService]
    );

    const clearCache = useCallback(async (): Promise<void> => {
        try {
            await cacheService.clearCache();
        } catch (error) {
            console.error('useBSRCache.clearCache error:', error);
            throw error;
        }
    }, [cacheService]);

    return {
        getCached,
        setCached,
        clearCache,
    };
}
