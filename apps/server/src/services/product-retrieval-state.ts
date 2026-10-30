import type { StoredProductRead } from '@/db/product/get-products';
import type { AmazonListingResolutionStatus } from './product-retrieval';

// Whether a stored Product's listing is known, and whether it is stale enough to fetch again.
export const getAmazonListingStatus = (
    stored: StoredProductRead | undefined
): AmazonListingResolutionStatus => {
    if (!stored) {
        return 'pending';
    }
    if (stored.product.amazonListingStatus === 'deleted') {
        return 'deleted';
    }
    if (stored.product.spApiFetchedAt) {
        return 'active';
    }
    if (stored.queuePending) {
        return 'pending';
    }
    return 'pending';
};

export const hasKnownListing = (stored: StoredProductRead | undefined) =>
    getAmazonListingStatus(stored) !== 'pending';

export const shouldResolve = (
    stored: StoredProductRead | undefined,
    cutoff: Date,
    rediscoveredAt?: Date
) => {
    if (!stored) {
        return true;
    }

    if (stored.product.amazonListingStatus === 'deleted') {
        return Boolean(
            rediscoveredAt &&
                (!stored.product.spApiResolvedAt || stored.product.spApiResolvedAt < rediscoveredAt)
        );
    }

    const resolvedAt = getLatestSpApiTimestamp(stored.product);
    return !resolvedAt || resolvedAt < cutoff;
};

const getLatestSpApiTimestamp = (product: StoredProductRead['product']) => {
    if (!product.spApiFetchedAt) {
        return product.spApiResolvedAt;
    }
    if (!product.spApiResolvedAt) {
        return product.spApiFetchedAt;
    }

    return product.spApiFetchedAt >= product.spApiResolvedAt
        ? product.spApiFetchedAt
        : product.spApiResolvedAt;
};
