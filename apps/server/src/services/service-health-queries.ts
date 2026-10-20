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
import { db } from '@/db/index.js';
import { catalogQueries, products, topSearchTermsDatasets } from '@/db/schema.js';
import { CATALOG_QUERY_REFRESH_INTERVAL_MS } from '@/services/catalog-query-refresh-policy.js';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
} from '@/services/keepa-refresh-policy.js';
import {
    CATALOG_QUERIES_SCHEDULER_LAG_MS,
    dueBefore,
    KEEPA_HISTORY_SCHEDULER_LAG_MS,
    PRODUCT_HEALTH_OVERDUE_FLOOR,
    readLiveness,
    readServiceHealth,
    type ServiceHealthProbes,
    SPAPI_CATALOG_SCHEDULER_LAG_MS,
    TOP_SEARCH_TERMS_SCHEDULER_LAG_MS,
} from '@/services/service-health.js';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';
import { SPAPI_REFRESH_POLICY_BUCKETS } from '@/services/spapi-refresh-policy.js';
import { buildAvailableMerchRefreshCondition } from '@/services/spapi-refresh-selection.js';
import { TOP_SEARCH_TERMS_REPORT_MAX_PENDING_MS } from '@/services/top-search-terms-report-state-machine.js';

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

export const probeTopSearchTerms = async (now: Date) => {
    const [row] = await db.execute<{ failing: boolean }>(topSearchTermsUnhealthyStatement(now));
    if (typeof row?.failing !== 'boolean') {
        throw new Error('Top search terms health probe returned no boolean.');
    }
    return row.failing;
};

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
        'top-search-terms': probeTopSearchTerms,
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
    return buildAvailableMerchRefreshCondition(freshness);
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

const catalogQueriesOverdueCondition = (now: Date) => {
    const successBefore = dueBefore(
        now,
        CATALOG_QUERY_REFRESH_INTERVAL_MS,
        CATALOG_QUERIES_SCHEDULER_LAG_MS
    );
    const createdBefore = dueBefore(now, 0, CATALOG_QUERIES_SCHEDULER_LAG_MS);
    return and(
        gt(catalogQueries.activeUntil, now),
        or(
            lte(catalogQueries.latestSuccessfulRunAt, successBefore),
            and(
                isNull(catalogQueries.latestSuccessfulRunAt),
                lte(catalogQueries.createdAt, createdBefore)
            )
        )
    );
};

const topSearchTermsUnhealthyStatement = (now: Date) => {
    const dueAt = dueBefore(now, 0, TOP_SEARCH_TERMS_SCHEDULER_LAG_MS);
    const pendingRequestedAfter = new Date(now.getTime() - TOP_SEARCH_TERMS_REPORT_MAX_PENDING_MS);
    const usDatasets = db
        .select({ id: topSearchTermsDatasets.id })
        .from(topSearchTermsDatasets)
        .where(eq(topSearchTermsDatasets.marketplaceId, SPAPI_US_MARKETPLACE_ID));
    const overdueDatasets = db
        .select({ id: topSearchTermsDatasets.id })
        .from(topSearchTermsDatasets)
        .where(
            and(
                eq(topSearchTermsDatasets.marketplaceId, SPAPI_US_MARKETPLACE_ID),
                overdueUsDataset(dueAt, pendingRequestedAfter)
            )
        );

    return sql`SELECT (${notExists(usDatasets)} OR ${exists(overdueDatasets)}) AS failing`;
};

const overdueUsDataset = (dueAt: Date, pendingRequestedAfter: Date) =>
    or(
        and(
            isNotNull(topSearchTermsDatasets.nextRefreshAt),
            lte(topSearchTermsDatasets.nextRefreshAt, dueAt),
            refreshIsNotWaitingOnAmazon(pendingRequestedAfter)
        ),
        and(
            eq(topSearchTermsDatasets.status, 'failed'),
            lte(topSearchTermsDatasets.lastFailedAt, dueAt),
            or(
                isNull(topSearchTermsDatasets.lastCompletedAt),
                lt(topSearchTermsDatasets.lastCompletedAt, topSearchTermsDatasets.lastFailedAt)
            )
        ),
        and(
            isNotNull(topSearchTermsDatasets.reportId),
            amazonReportInFlight(),
            isNotNull(topSearchTermsDatasets.reportRequestedAt),
            lte(topSearchTermsDatasets.reportRequestedAt, pendingRequestedAfter)
        )
    );

const refreshIsNotWaitingOnAmazon = (pendingRequestedAfter: Date) =>
    or(
        isNull(topSearchTermsDatasets.reportId),
        not(amazonReportInFlight()),
        isNull(topSearchTermsDatasets.reportRequestedAt),
        lte(topSearchTermsDatasets.reportRequestedAt, pendingRequestedAfter)
    );

const amazonReportInFlight = () =>
    inArray(topSearchTermsDatasets.status, ['queued', 'in_progress']);

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
