import { and, asc, eq, gt, gte, isNotNull, isNull, lt, type SQL, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, products } from '@/db/schema';
import { TOP_SEARCH_TERMS_REPORT_PERIODS } from '@/db/top-search-terms/types';
import { topSearchTermsDatasets } from '@/db/top-search-terms-schema';
import { buildAvailableMerchRefreshCondition } from '@/jobs/reprocess-stale-products';
import { CATALOG_QUERY_REFRESH_INTERVAL_MS } from '@/services/catalog-query-refresh-policy';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
} from '@/services/keepa-refresh-policy';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { SPAPI_REFRESH_POLICY_BUCKETS } from '@/services/spapi-refresh-policy';
import { getTopSearchTermsFreshnessDueAt } from '@/services/top-search-terms-dataset-windows';

export type JobRunnerState = 'enabled' | 'disabled';

type HealthReadTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type FreshnessReading = Date | 'nothing-due';

interface FreshnessCheck {
    readonly name: string;
    readonly slackMs: number;
    readonly readEarliestDueAt: (tx: HealthReadTransaction, now: Date) => Promise<FreshnessReading>;
}

const HOUR_MS = 60 * 60 * 1000;

export const FRESHNESS_CHECKS = [
    {
        name: 'product-details',
        slackMs: 6 * HOUR_MS,
        readEarliestDueAt: async tx => {
            const dueAt = spApiRefreshDueAt();
            const [row] = await tx
                .select({ dueAt })
                .from(products)
                .where(buildAvailableMerchRefreshCondition(isNotNull(products.spApiFetchedAt)))
                .orderBy(asc(dueAt))
                .limit(1);
            return row?.dueAt ?? 'nothing-due';
        },
    },
    {
        name: 'product-history',
        slackMs: 24 * HOUR_MS,
        readEarliestDueAt: async tx => {
            const dueAt = keepaHistoryDueAt();
            const [row] = await tx
                .select({ dueAt })
                .from(products)
                .where(
                    and(
                        eq(products.isMerchListing, true),
                        lt(products.rootCategoryBsr, KEEPA_WEEKLY_AUTO_BSR_THRESHOLD)
                    )
                )
                .orderBy(asc(dueAt))
                .offset(PRODUCT_HISTORY_TOLERATED_STRAGGLERS)
                .limit(1);
            return row?.dueAt ?? 'nothing-due';
        },
    },
    {
        name: 'top-search-terms',
        slackMs: 12 * HOUR_MS,
        readEarliestDueAt: async (tx, now) => {
            const rows = await tx
                .select({
                    reportPeriod: topSearchTermsDatasets.reportPeriod,
                    newestFinalEndDate: sql<string>`max(${topSearchTermsDatasets.dataEndDate})`,
                })
                .from(topSearchTermsDatasets)
                .where(
                    and(
                        eq(topSearchTermsDatasets.marketplaceId, SPAPI_US_MARKETPLACE_ID),
                        isNotNull(topSearchTermsDatasets.lastCompletedAt),
                        isNull(topSearchTermsDatasets.nextRefreshAt)
                    )
                )
                .groupBy(topSearchTermsDatasets.reportPeriod);
            const dueAtMs = TOP_SEARCH_TERMS_REPORT_PERIODS.map(reportPeriod =>
                getTopSearchTermsFreshnessDueAt({
                    reportPeriod,
                    newestFinalEndDate:
                        rows.find(row => row.reportPeriod === reportPeriod)?.newestFinalEndDate ??
                        null,
                    now,
                }).getTime()
            );
            return new Date(Math.min(...dueAtMs));
        },
    },
    {
        name: 'catalog-keywords',
        slackMs: 6 * HOUR_MS,
        readEarliestDueAt: async (tx, now) => {
            const dueAt = sql<Date>`coalesce(
                ${catalogQueries.latestSuccessfulRunAt}
                    + ${millisecondsInterval(CATALOG_QUERY_REFRESH_INTERVAL_MS)},
                ${catalogQueries.createdAt}
            )`.mapWith(catalogQueries.createdAt);
            const [row] = await tx
                .select({ dueAt })
                .from(catalogQueries)
                .where(gt(catalogQueries.activeUntil, now))
                .orderBy(asc(dueAt))
                .offset(CATALOG_KEYWORDS_TOLERATED_STRAGGLERS)
                .limit(1);
            return row?.dueAt ?? 'nothing-due';
        },
    },
] as const satisfies readonly FreshnessCheck[];

export type FreshnessCheckName = (typeof FRESHNESS_CHECKS)[number]['name'];

export type HealthProbe =
    | { readonly database: 'unreachable' }
    | {
          readonly database: 'reachable';
          readonly freshness: { readonly [Name in FreshnessCheckName]?: FreshnessReading };
      };

export const judgedFreshnessChecks = (
    jobRunner: JobRunnerState
): readonly (typeof FRESHNESS_CHECKS)[number][] => {
    switch (jobRunner) {
        case 'enabled':
            return FRESHNESS_CHECKS;
        case 'disabled':
            return [];
        default:
            return assertNever(jobRunner);
    }
};

export const readHealthProbe = async ({
    now,
    jobRunner,
}: {
    readonly now: Date;
    readonly jobRunner: JobRunnerState;
}): Promise<HealthProbe> => {
    const transaction = db
        .transaction(
            async tx => {
                await tx.execute(sql.raw(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`));
                await tx.execute(sql`select 1`);
                const freshness: { [Name in FreshnessCheckName]?: FreshnessReading } = {};
                for (const check of judgedFreshnessChecks(jobRunner)) {
                    await tx
                        .transaction(savepoint => check.readEarliestDueAt(savepoint, now))
                        .then(
                            reading => {
                                freshness[check.name] = reading;
                            },
                            () => undefined
                        );
                }
                return { database: 'reachable', freshness } as const;
            },
            { accessMode: 'read only' }
        )
        .catch(() => UNREACHABLE);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<HealthProbe>(resolve => {
        deadline = setTimeout(() => resolve(UNREACHABLE), PROBE_DEADLINE_MS);
    });
    try {
        return await Promise.race([transaction, timedOut]);
    } finally {
        clearTimeout(deadline);
    }
};

// Raw `timestamp` values arrive as zone-less strings, so every due moment decodes through a
// column mapper to become a UTC instant.
const spApiRefreshDueAt = () => {
    const tiers = SPAPI_REFRESH_POLICY_BUCKETS.map(
        bucket =>
            sql`when ${bsrInBucket(bucket)} then ${millisecondsInterval(bucket.refreshAfterMs)}`
    );
    return sql<Date>`${products.spApiFetchedAt} + case ${sql.join(tiers, sql` `)} end`.mapWith(
        products.spApiFetchedAt
    );
};

const bsrInBucket = ({
    minBsrInclusive,
    maxBsrExclusive,
}: (typeof SPAPI_REFRESH_POLICY_BUCKETS)[number]) => {
    const atLeastMin = gte(products.rootCategoryBsr, minBsrInclusive);
    return maxBsrExclusive === null
        ? atLeastMin
        : sql`${atLeastMin} and ${lt(products.rootCategoryBsr, maxBsrExclusive)}`;
};

const keepaHistoryDueAt = () =>
    sql<Date>`coalesce(
        ${products.keepaFetchedAt} + case
            when ${products.rootCategoryBsr} < ${KEEPA_DAILY_AUTO_BSR_THRESHOLD}
                then ${millisecondsInterval(KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS)}
            else ${millisecondsInterval(KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS)}
        end,
        ${products.createdAt}
    )`.mapWith(products.createdAt);

const millisecondsInterval = (milliseconds: number): SQL =>
    sql`(${milliseconds} * interval '1 millisecond')`;

const assertNever = (value: never): never => {
    throw new Error(`Unsupported job runner state: ${value}`);
};

const UNREACHABLE = { database: 'unreachable' } as const satisfies HealthProbe;
const PROBE_DEADLINE_MS = 3000;
const STATEMENT_TIMEOUT_MS = 500;
const PRODUCT_HISTORY_TOLERATED_STRAGGLERS = 25;
const CATALOG_KEYWORDS_TOLERATED_STRAGGLERS = 3;
