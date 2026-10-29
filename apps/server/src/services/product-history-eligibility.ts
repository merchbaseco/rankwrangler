import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import { getKeepaRefreshDecision } from '@/services/keepa-refresh-policy';

type HistoryEligibility = Pick<
    typeof products.$inferSelect,
    | 'isMerchListing'
    | 'rootCategoryBsr'
    | 'keepaFetchedAt'
    | 'amazonListingStatus'
    | 'historyAdmissionState'
>;

export const getAutomaticHistoryDecision = (product: HistoryEligibility, now = new Date()) => {
    if (product.amazonListingStatus !== 'active') {
        return { shouldRefresh: false, reason: 'not_eligible' } as const;
    }
    if (product.historyAdmissionState !== 'admitted') {
        return { shouldRefresh: false, reason: 'not_admitted' } as const;
    }
    return getKeepaRefreshDecision({ ...product, now });
};

export const shouldKeepaHistoryRefreshAsin = async (identity: {
    marketplaceId: string;
    asin: string;
}) => {
    const product = await getProductHistoryEligibilitySnapshot(identity);
    return product
        ? getAutomaticHistoryDecision(product)
        : ({ shouldRefresh: false, reason: 'product_missing' } as const);
};

export const getProductHistoryEligibilitySnapshot = async ({
    marketplaceId,
    asin,
}: {
    marketplaceId: string;
    asin: string;
}) => {
    const [product] = await db
        .select({
            isMerchListing: products.isMerchListing,
            rootCategoryBsr: products.rootCategoryBsr,
            keepaFetchedAt: products.keepaFetchedAt,
            amazonListingStatus: products.amazonListingStatus,
            historyAdmissionState: products.historyAdmissionState,
        })
        .from(products)
        .where(and(eq(products.marketplaceId, marketplaceId), eq(products.asin, asin)))
        .limit(1);
    return product ?? null;
};
