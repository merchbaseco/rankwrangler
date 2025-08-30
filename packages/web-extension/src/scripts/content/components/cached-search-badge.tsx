import { useEffect, useState } from 'react';
import { getProduct } from '@/scripts/api/get-product';
import { getCachedProduct, setCachedProduct } from '@/scripts/api/product-cache';
import { US_MARKETPLACE_ID } from '@/scripts/types/marketplace';
import { SearchBadge } from './search-badge';

interface CachedSearchBadgeProps {
    asin: string;
}

export function CachedSearchBadge({ asin }: CachedSearchBadgeProps) {
    const [state, setState] = useState<'loading' | 'success' | 'error' | 'no-data'>('loading');
    const [bsr, setBsr] = useState<number>();
    const [creationDate, setCreationDate] = useState<string>();

    useEffect(() => {
        async function loadBsr() {
            try {
                const cachedProduct = await getCachedProduct(asin);

                if (cachedProduct) {
                    if (cachedProduct.bsr > 0) {
                        setState('success');
                        setBsr(cachedProduct.bsr);
                        setCreationDate(cachedProduct.creationDate);
                    } else {
                        setState('no-data'); // Cached "no BSR" result
                    }
                    return;
                }

                // Fetch product info
                const product = await getProduct({ asin, marketplaceId: US_MARKETPLACE_ID });

                if (product.metadata.success) {
                    await setCachedProduct(product);

                    // Update state based on whether BSR exists
                    if (product.bsr) {
                        setState('success');
                        setBsr(product.bsr);
                        setCreationDate(product.creationDate);
                    } else {
                        setState('no-data'); // Valid response, just no BSR
                    }
                } else {
                    throw new Error();
                }
            } catch (_e) {
                setState('error');
            }
        }

        loadBsr();
    }, [asin]);

    return <SearchBadge asin={asin} state={state} bsr={bsr} creationDate={creationDate} />;
}
