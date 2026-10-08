import { and, eq, isNotNull, type or } from 'drizzle-orm';
import { products } from '@/db/schema.js';

export const buildAvailableMerchRefreshCondition = (freshnessCondition: ReturnType<typeof or>) =>
    and(
        products.isMerchListing,
        eq(products.amazonListingStatus, 'active'),
        isNotNull(products.rootCategoryBsr),
        freshnessCondition
    );
