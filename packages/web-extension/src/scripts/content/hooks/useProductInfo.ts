import { useCallback, useEffect, useState } from 'react';
import { apiService } from '../services/api';
import type { BSRInfo, ProductInfo } from '../types';
import { useBSRCache } from './useBSRCache';

/**
 * Hook for fetching product information with caching
 * Handles BSR data fetching, caching, and state management
 */
export function useProductInfo(
    asin: string,
    marketplaceId: string = 'ATVPDKIKX0DER'
) {
    const [data, setData] = useState<ProductInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { getCached, setCached } = useBSRCache();

    const fetchProductInfo = useCallback(async () => {
        if (isLoading) return;

        console.log(`[useProductInfo] Starting fetch for ASIN: ${asin}`);
        setIsLoading(true);
        setError(null);

        try {
            // Check cache first
            console.log(`[useProductInfo] Checking cache for ASIN: ${asin}`);
            const cachedData = await getCached(asin);
            if (cachedData) {
                console.log(`[useProductInfo] Found cached data for ASIN: ${asin}`, cachedData);
                // Use cached data
                const productInfo = {
                    asin,
                    creationDate: cachedData.dateFirstAvailable,
                    bsr: parseInt(cachedData.rank.replace(/,/g, ''), 10),
                    metadata: {
                        lastFetched: new Date(cachedData.timestamp).toISOString(),
                        cached: true,
                    },
                };

                setData(productInfo);
                setIsLoading(false);
                return;
            }

            console.log(`[useProductInfo] No cache found, making API call for ASIN: ${asin}`);

            // Add ASIN to queue
            console.log(`[useProductInfo] Adding ${asin} to queue`);
            await apiService.updateQueue('add', asin);

            // Fetch from API
            console.log(`[useProductInfo] Calling apiService.fetchProductInfo for ASIN: ${asin}`);
            const response = await apiService.fetchProductInfo(asin, marketplaceId);
            console.log(`[useProductInfo] API response for ASIN ${asin}:`, response);

            // Remove from queue
            await apiService.updateQueue('remove', asin);

            if (!response.success || !response.data) {
                throw new Error(response.error || 'Failed to fetch product info');
            }

            const productInfo = response.data;
            console.log(`[useProductInfo] Setting product data for ASIN ${asin}:`, productInfo);
            setData(productInfo);

            // Cache successful results if we have BSR and creation date
            if (productInfo.bsr && productInfo.creationDate) {
                console.log(`[useProductInfo] Caching data for ASIN: ${asin}`);
                const formattedDate = new Date(productInfo.creationDate).toLocaleDateString(
                    'en-US',
                    {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    }
                );

                const bsrInfo = {
                    rank: productInfo.bsr.toLocaleString(),
                    category: 'Clothing', // API returns BSR for clothing category
                    dateFirstAvailable: formattedDate,
                };

                await setCached(asin, bsrInfo);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            console.error(`[useProductInfo] Error fetching data for ASIN ${asin}:`, error);
            setError(errorMessage);

            // Remove from queue on error
            await apiService.updateQueue('remove', asin);
        } finally {
            setIsLoading(false);
            console.log(`[useProductInfo] Finished processing ASIN: ${asin}`);
        }
    }, [asin, marketplaceId, isLoading, getCached, setCached]);

    const refetch = useCallback(async () => {
        setData(null);
        setError(null);
        await fetchProductInfo();
    }, [fetchProductInfo]);

    // Automatically fetch product info on mount (only once)
    useEffect(() => {
        fetchProductInfo();
    }, []); // Empty dependency array = run only once on mount

    return {
        data,
        isLoading,
        error,
        refetch,
    };
}
