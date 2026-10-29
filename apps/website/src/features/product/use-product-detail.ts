import { useCallback, useMemo } from 'react';
import { api, type RouterOutputs } from '@/lib/trpc';
import { useRealtimeReconnect } from '@/lib/trpc-provider';
import type { ProductIdentity } from './product-identity';

export type ProductDetail = NonNullable<RouterOutputs['api']['app']['product']['get']['product']>;
type ProductRead = RouterOutputs['api']['app']['product']['get'];

/**
 * The product's stored record (`product.get`, never forcing an SP-API
 * refresh) plus its page-only detail: short name, cutout, brand design count,
 * best-ever BSR. Refetches when `product.sync.completed` reports this ASIN, and
 * after a realtime reconnect in case that event was missed.
 */
export const useProductDetail = ({ asin, marketplaceId }: ProductIdentity) => {
    const input = useMemo(
        () => ({ asin, includeProvenance: false, marketplaceId, refresh: false }),
        [asin, marketplaceId]
    );
    const query = api.api.app.product.get.useQuery(input, {
        refetchOnWindowFocus: false,
        staleTime: 30_000,
    });
    const { refetch } = query;

    const handleSync = useCallback(
        (event: { asin: string; marketplaceId: string }) => {
            if (event.marketplaceId === marketplaceId && event.asin === asin) {
                refetch().catch((error: unknown) => {
                    console.error('Refetching product after sync failed', error);
                });
            }
        },
        [asin, marketplaceId, refetch]
    );
    api.api.app.product.sync.completed.useSubscription(
        { marketplaceId },
        { enabled: Boolean(asin && marketplaceId), onData: handleSync }
    );
    useRealtimeReconnect({ enabled: Boolean(asin && marketplaceId), onReconnect: refetch });

    const read: ProductRead | undefined = query.data;
    return {
        amazonListingStatus: read?.amazonListingStatus ?? 'pending',
        error: query.error,
        isLoading: query.isLoading,
        product: read?.product ? { ...read.product, ...pageDetail(read) } : null,
    };
};

export type ProductPageDetail = ProductDetail & ReturnType<typeof pageDetail>;

const pageDetail = (read: ProductRead) => ({
    bestEverBsr: read.bestEverBsr,
    brandDesignCount: read.brandDesignCount,
    cutoutThumbnailUrl: read.cutoutThumbnailUrl,
    shortName: read.shortName,
});
