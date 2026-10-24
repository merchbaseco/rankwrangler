import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { products } from '@/db/schema';

export const SPAPI_BLINDSPOT_SCAN_LIMIT = 20;

export const buildSpApiBlindspotRefreshCondition = (now = new Date()) => {
    const latestSuccess = sql`greatest(${products.spApiFetchedAt}, ${products.spApiResolvedAt})`;
    const inProbation = sql`${products.createdAt} > ${now.toISOString()}::timestamp - interval '30 days'`;
    return and(
        eq(products.amazonListingStatus, 'active'),
        or(
            and(
                eq(products.isMerchListing, true),
                isNull(products.rootCategoryBsr),
                sql`(${latestSuccess} IS NULL OR ${latestSuccess} <= ${now.toISOString()}::timestamp - (
                    CASE
                        WHEN ${inProbation} THEN
                            CASE WHEN ${latestSuccess} < ${products.createdAt} + interval '3 days'
                                THEN interval '3 days' ELSE interval '14 days' END
                        ELSE interval '30 days'
                    END
                ))`
            ),
            and(
                isNull(products.isMerchListing),
                sql`(${latestSuccess} IS NULL OR ${latestSuccess} <= ${now.toISOString()}::timestamp - (
                    CASE WHEN ${inProbation} THEN interval '7 days' ELSE interval '30 days' END
                ))`
            )
        )
    );
};
