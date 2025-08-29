import { useEffect, useState } from 'react';
import { SearchBadge } from './search-badge';
import { useBSRCache } from '../hooks/use-bsr-cache';
import { apiService } from '../services/api';
import type { BSRInfo } from '../types';

interface CachedSearchBadgeProps {
    asin: string;
}

export function CachedSearchBadge({ asin }: CachedSearchBadgeProps) {
    const { getCached, setCached } = useBSRCache();
    const [state, setState] = useState<'loading' | 'success' | 'error' | 'no-data'>('loading');
    const [bsr, setBsr] = useState<number>();

    useEffect(() => {
        async function loadBsr() {
            try {
                console.log(`[CachedSearchBadge] Checking cache for ASIN: ${asin}`);
                
                // Check cache first
                const cached = await getCached(asin);
                if (cached) {
                    console.log(`[CachedSearchBadge] Cache hit for ASIN: ${asin}`);
                    
                    const cachedBsr = parseInt(cached.rank);
                    if (cachedBsr > 0) {
                        setState('success');
                        setBsr(cachedBsr);
                    } else {
                        setState('no-data'); // Cached "no BSR" result
                    }
                    return;
                }

                console.log(`[CachedSearchBadge] Cache miss, fetching BSR for ASIN: ${asin}`);
                
                // Add to queue
                await apiService.updateQueue('add', asin);

                // Fetch product info
                const response = await apiService.fetchProductInfo(asin);
                
                // Remove from queue
                await apiService.updateQueue('remove', asin);

                if (response.success) {
                    console.log(`[CachedSearchBadge] API response for ASIN ${asin}:`, response.data?.bsr ? `BSR ${response.data.bsr}` : 'No BSR data');
                    
                    // Always cache the result, whether BSR exists or not
                    const bsrInfo: BSRInfo = {
                        rank: response.data?.bsr ? response.data.bsr.toString() : '0',
                        category: response.data?.bsr ? 'Products' : 'No Data',
                        dateFirstAvailable: new Date().toISOString().split('T')[0]
                    };
                    await setCached(asin, bsrInfo);
                    
                    // Update state based on whether BSR exists
                    if (response.data?.bsr) {
                        setState('success');
                        setBsr(response.data.bsr);
                    } else {
                        setState('no-data'); // Valid response, just no BSR
                    }
                } else {
                    throw new Error(response.error || 'API request failed');
                }
            } catch (error) {
                console.error(`[CachedSearchBadge] Error fetching BSR for ASIN ${asin}:`, error);
                setState('error');
                
                // Make sure to remove from queue on error
                await apiService.updateQueue('remove', asin);
            }
        }

        loadBsr();
    }, [asin, getCached, setCached]);

    return <SearchBadge asin={asin} state={state} bsr={bsr} />;
}