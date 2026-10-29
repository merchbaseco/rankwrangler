import {
    and,
    eq,
    exists,
    gt,
    gte,
    inArray,
    isNotNull,
    isNull,
    lt,
    lte,
    not,
    notExists,
    or,
    sql,
} from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, products } from '@/db/schema';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
} from '@/services/keepa-refresh-policy';
import {
    CATALOG_QUERIES_SCHEDULER_LAG_MS,
    dueBefore,
    KEEPA_HISTORY_SCHEDULER_LAG_MS,
    PRODUCT_HEALTH_OVERDUE_FLOOR,
    readLiveness,
    readServiceHealth,
    type ServiceHealthProbes,
    SPAPI_CATALOG_SCHEDULER_LAG_MS,
} from '@/services/service-health';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { buildSpApiBlindspotRefreshCondition } from '@/services/spapi-blindspot-selection';
import { SPAPI_REFRESH_POLICY_BUCKETS } from '@/services/spapi-refresh-policy';
import { buildAvailableMerchRefreshCondition } from '@/services/spapi-refresh-selection';

const probePostgres = async () => {
    await db.execute(sql`SELECT 1`);
};

export const probeSpapiCatalog = async (now: Date) => {
    const condition = spapiCatalogOverdueCondition(now);
    if (!condition) {
        return false;
    }
    return hasProductOverdueFloor(condition);
};

export const probeKeepaHistory = async (now: Date) =>
    hasProductOverdueFloor(keepaHistoryOverdueCondition(now));

export const probeCatalogQueries = async (now: Date) => {
    const [row] = await db
        .select({ id: catalogQueries.id })
        .from(catalogQueries)
        .where(catalogQueriesOverdueCondition(now))
        .limit(1);
    return row !== undefined;
};

export const createDatabaseHealthReaders = () => ({
    readLiveness: () => readLiveness({ postgres: probePostgres }),
    readServiceHealth: () => readServiceHealth(databaseHealthProbes),
});

const databaseHealthProbes: ServiceHealthProbes = {
    postgres: probePostgres,
    freshness: {
        'catalog-queries': probeCatalogQueries,
        'keepa-history': probeKeepaHistory,
        'spapi-catalog': probeSpapiCatalog,
    },
};

const spapiCatalogOverdueCondition = (now: Date) => {
    const freshness = or(
        ...SPAPI_REFRESH_POLICY_BUCKETS.map(bucket => {
            const fetchedBefore = dueBefore(
                now,
                bucket.refreshAfterMs,
                SPAPI_CATALOG_SCHEDULER_LAG_MS
            );
            const bsrRange =
                bucket.maxBsrExclusive === null
                    ? gte(products.rootCategoryBsr, bucket.minBsrInclusive)
                    : and(
                          gte(products.rootCategoryBsr, bucket.minBsrInclusive),
                          lt(products.rootCategoryBsr, bucket.maxBsrExclusive)
                      );
            return and(bsrRange, lt(products.spApiFetchedAt, fetchedBefore));
        })
    );
    if (!freshness) {
        return undefined;
    }
    return or(
        buildAvailableMerchRefreshCondition(
            or(
                freshness,
                and(
                    isNull(products.spApiFetchedAt),
                    lte(products.createdAt, dueBefore(now, 0, SPAPI_CATALOG_SCHEDULER_LAG_MS))
                )
            )
        ),
        and(
            buildSpApiBlindspotRefreshCondition(
                new Date(now.getTime() - SPAPI_CATALOG_SCHEDULER_LAG_MS)
            ),
            lte(products.createdAt, dueBefore(now, 0, SPAPI_CATALOG_SCHEDULER_LAG_MS))
        )
    );
};

const keepaHistoryOverdueCondition = (now: Date) => {
    const eligibleBefore = dueBefore(now, 0, KEEPA_HISTORY_SCHEDULER_LAG_MS);
    const dailyFetchedBefore = dueBefore(
        now,
        KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
        KEEPA_HISTORY_SCHEDULER_LAG_MS
    );
    const weeklyFetchedBefore = dueBefore(
        now,
        KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
        KEEPA_HISTORY_SCHEDULER_LAG_MS
    );

    return and(
        eq(products.isMerchListing, true),
        eq(products.amazonListingStatus, 'active'),
        eq(products.historyAdmissionState, 'admitted'),
        isNotNull(products.rootCategoryBsr),
        lt(products.rootCategoryBsr, KEEPA_WEEKLY_AUTO_BSR_THRESHOLD),
        spApiWriteOlderThanSchedulerLag(eligibleBefore),
        or(
            and(
                lt(products.rootCategoryBsr, KEEPA_DAILY_AUTO_BSR_THRESHOLD),
                keepaFetchedAtOrCreatedAtDue(dailyFetchedBefore, eligibleBefore)
            ),
            and(
                gte(products.rootCategoryBsr, KEEPA_DAILY_AUTO_BSR_THRESHOLD),
                lt(products.rootCategoryBsr, KEEPA_WEEKLY_AUTO_BSR_THRESHOLD),
                keepaFetchedAtOrCreatedAtDue(weeklyFetchedBefore, eligibleBefore)
            )
        )
    );
};

const catalogQueriesOverdueCondition = (now: Date) =>
    and(
        sql`${catalogQueries.tier} <> 'stored'`,
        lte(catalogQueries.nextDueAt, dueBefore(now, 0, CATALOG_QUERIES_SCHEDULER_LAG_MS)),
        or(
            gt(catalogQueries.failureCount, 0),
            isNull(catalogQueries.nextRefreshAttemptAt),
            lte(
                catalogQueries.nextRefreshAttemptAt,
                dueBefore(now, 0, CATALOG_QUERIES_SCHEDULER_LAG_MS)
            )
        )
    );

const hasProductOverdueFloor = async (condition: ReturnType<typeof and>) => {
    if (!condition) {
        return false;
    }
    const rows = await db
        .select({ id: products.id })
        .from(products)
        .where(condition)
        .limit(PRODUCT_HEALTH_OVERDUE_FLOOR);
    return rows.length >= PRODUCT_HEALTH_OVERDUE_FLOOR;
};

const spApiWriteOlderThanSchedulerLag = (eligibleBefore: Date) =>
    or(isNull(products.spApiFetchedAt), lte(products.spApiFetchedAt, eligibleBefore));

const keepaFetchedAtOrCreatedAtDue = (fetchedBefore: Date, createdBefore: Date) =>
    or(
        and(isNull(products.keepaFetchedAt), lte(products.createdAt, createdBefore)),
        lte(products.keepaFetchedAt, fetchedBefore)
    );
