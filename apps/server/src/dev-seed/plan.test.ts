import { describe, expect, it } from 'bun:test';
import {
    catalogQueryStatuses,
    deriveCatalogQueryStatus,
} from '@/services/catalog-query-refresh-policy';
import {
    eventLogLevels,
    eventLogPrimitiveTypes,
    eventLogStatuses,
} from '@/services/event-log-enums';
import { PRODUCT_DEFAULT_MAX_AGE_MS } from '@/services/product-freshness-policy';
import { productFacetKeys } from '@/services/product-facet-taxonomy';
import { keepaHistoryMetricColumns } from '@/services/keepa-history-metrics';
import { classifyMerchKeyword } from '@/services/spapi/ba-keywords-aggregation';
import { DEV_SEED_ASIN_PREFIX, DEV_SEED_UUID_PREFIX } from '@/dev-seed/identity';
import { buildDevSeedPlan } from '@/dev-seed/plan';
import { DAY_MS, HOUR_MS } from '@/dev-seed/time-offsets';
import { DEV_SEED_TABLE_KEYS, summarizePlan, type DevSeedPlan } from '@/dev-seed/types';

/**
 * The coverage contract.
 *
 * This is not a test of how the builders are written; it is a test of what the
 * seed promises a developer who runs it. Each case states a promise the
 * dashboard depends on — a view that will not be empty, a filter that will
 * partition rather than match everything, a badge that will actually appear, a
 * provider that will never be called. If a promise stops holding, a developer
 * would otherwise find out by opening a blank page and doubting the feature
 * rather than the fixture.
 *
 * Where a promise is about application behaviour, it is asserted through the
 * shipped code that implements that behaviour — the real Catalog-query status
 * policy, the real keyword classifier, the real freshness constant — so the
 * contract tracks the product instead of restating the fixture.
 */

/** A fixed anchor, so a promise about the generated week cannot pass by luck. */
const NOW = new Date('2026-08-20T15:30:00.000Z');
const plan = buildDevSeedPlan({ now: NOW });
const summary = summarizePlan(plan);

describe('dev seed coverage contract: shape and reproducibility', () => {
    it('promises every surface has rows', () => {
        for (const key of DEV_SEED_TABLE_KEYS) {
            expect({ key, rows: plan[key].length > 0 }).toEqual({ key, rows: true });
        }
    });

    it('promises a small, fast dataset rather than a load test', () => {
        const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
        expect(total).toBeGreaterThan(1500);
        expect(total).toBeLessThan(6000);
    });

    it('promises the same seed and clock reproduce the same week exactly', () => {
        expect(summarizePlan(buildDevSeedPlan({ now: NOW }))).toEqual(summary);
        expect(buildDevSeedPlan({ now: NOW }).products).toEqual(plan.products);
    });

    it('promises a different seed produces a different catalog, not a relabelled one', () => {
        const other = buildDevSeedPlan({ now: NOW, seed: 'a-different-week' });
        const titles = new Set(plan.products.map(product => product.title));
        const otherTitles = other.products.map(product => product.title);

        expect(otherTitles.some(title => !titles.has(title))).toBe(true);
    });

    it('promises every marketplace-scoped row carries the plan marketplace', () => {
        for (const product of plan.products) {
            expect(product.marketplaceId).toBe(plan.marketplaceId);
        }
        for (const query of plan.catalogQueries) {
            expect(query.marketplaceId).toBe(plan.marketplaceId);
        }
        for (const dataset of plan.topSearchTermsDatasets) {
            expect(dataset.marketplaceId).toBe(plan.marketplaceId);
        }
    });

    it('promises every row is marked, so a re-run clears its own rows and nothing else', () => {
        for (const key of DEV_SEED_TABLE_KEYS) {
            for (const row of plan[key]) {
                const marked = 'id' in row ? row.id : (row as { productId: string }).productId;
                expect({ key, marked: String(marked).startsWith(DEV_SEED_UUID_PREFIX) }).toEqual({
                    key,
                    marked: true,
                });
            }
        }

        for (const product of plan.products) {
            expect(product.asin.startsWith(DEV_SEED_ASIN_PREFIX)).toBe(true);
        }
    });
});

describe('dev seed coverage contract: the Product catalog', () => {
    it('promises no Product is stale, so opening the dashboard never calls a provider', () => {
        for (const product of plan.products) {
            for (const fetchedAt of [product.keepaFetchedAt, product.spApiFetchedAt]) {
                expect(age(fetchedAt)).toBeLessThan(PRODUCT_DEFAULT_MAX_AGE_MS);
            }
        }
    });

    it('promises the "last updated" filter partitions the catalog', () => {
        const withinDay = plan.products.filter(
            product => age(product.spApiFetchedAt) <= 24 * HOUR_MS
        );

        expect(withinDay.length).toBeGreaterThan(5);
        expect(withinDay.length).toBeLessThan(plan.products.length - 5);
    });

    it('promises all three states of Merch-listing knowledge are represented', () => {
        const values = new Set(plan.products.map(product => product.isMerchListing));

        expect(values.has(true)).toBe(true);
        expect(values.has(false)).toBe(true);
        expect(values.has(null)).toBe(true);
    });

    it('promises a known non-Merch listing stores no seller bullets', () => {
        for (const product of plan.products) {
            if (product.isMerchListing !== true) {
                expect(product.bullet1 ?? null).toBeNull();
                expect(product.bullet2 ?? null).toBeNull();
            }
        }
    });

    it('promises both Amazon listing statuses and every facet state appear', () => {
        expect(distinct(plan.products, product => product.amazonListingStatus).sort()).toEqual([
            'active',
            'deleted',
        ]);
        expect(distinct(plan.products, product => product.facetsState).sort()).toEqual([
            'error',
            'pending',
            'ready',
        ]);
    });

    it('promises the BSR filter has something on both sides of its range', () => {
        const ranked = plan.products
            .map(product => product.rootCategoryBsr)
            .filter((bsr): bsr is number => typeof bsr === 'number');

        expect(ranked.length).toBeGreaterThan(plan.products.length / 2);
        expect(Math.min(...ranked)).toBeLessThan(50_000);
        expect(Math.max(...ranked)).toBeGreaterThan(500_000);
        // Rank-less Products exist too, because Amazon has plenty of them.
        expect(ranked.length).toBeLessThan(plan.products.length);
    });

    it('promises the filter sidebar offers every facet in the taxonomy', () => {
        const seededFacets = new Set(plan.productFacetValues.map(value => value.facet));

        for (const facetKey of productFacetKeys) {
            expect({ facetKey, present: seededFacets.has(facetKey) }).toEqual({
                facetKey,
                present: true,
            });
        }
    });

    it('promises every facet value the sidebar lists is attached to a Product', () => {
        const attached = new Set(plan.productFacets.map(link => link.facetValueId));
        const orphans = plan.productFacetValues.filter(value => !attached.has(String(value.id)));

        // Some vocabulary is allowed to go unused, but most of it must be live
        // or the sidebar fills with facets that filter to nothing.
        expect(orphans.length).toBeLessThan(plan.productFacetValues.length / 3);
    });

    it('promises every Product renders a thumbnail without a network request', () => {
        for (const product of plan.products) {
            expect(product.thumbnailUrl).toMatch(/^data:image\/svg\+xml;base64,/u);
        }
    });
});

describe('dev seed coverage contract: Product history', () => {
    const points = plan.productHistoryPoints;

    it('promises the chart has both a rank series and a price series', () => {
        const metrics = new Set(points.map(point => point.metric));

        // Asserted through the stored-name map, because the API key and the
        // stored column name differ and a seed that writes the API key
        // produces a series the history reader cannot find.
        expect(metrics.has(keepaHistoryMetricColumns.bsrMain)).toBe(true);
        expect(metrics.has(keepaHistoryMetricColumns.priceNew)).toBe(true);
        expect(metrics.has(keepaHistoryMetricColumns.bsrCategory)).toBe(true);
    });

    it('promises most Products have history and some deliberately do not', () => {
        const withHistory = new Set(points.map(point => point.productId));

        expect(withHistory.size).toBeGreaterThan(plan.products.length / 2);
        expect(withHistory.size).toBeLessThan(plan.products.length);
    });

    it('promises each series spans the generated week rather than a single day', () => {
        const observed = points
            .filter(point => point.metric === keepaHistoryMetricColumns.bsrMain)
            .map(point => point.observedAt.getTime());
        const span = Math.max(...observed) - Math.min(...observed);

        expect(span).toBeGreaterThanOrEqual((plan.options.dayCount - 1) * DAY_MS);
        expect(Math.max(...observed)).toBeLessThanOrEqual(NOW.getTime());
    });

    it('promises a missing point exists, because Keepa reports gaps and the chart must survive one', () => {
        const missing = points.filter(point => point.isMissing);

        expect(missing.length).toBeGreaterThan(0);
        for (const point of missing) {
            expect(point.valueInt ?? null).toBeNull();
        }
    });

    it('promises the category series carries a real category id, not the main-rank sentinel', () => {
        const categoryPoints = points.filter(
            point => point.metric === keepaHistoryMetricColumns.bsrCategory
        );

        expect(categoryPoints.length).toBeGreaterThan(0);
        for (const point of categoryPoints) {
            expect(point.categoryId).toBeGreaterThan(0);
        }
    });

    it('promises the history import log shows both a success and a failure', () => {
        expect(distinct(plan.productHistoryImports, row => row.status).sort()).toEqual([
            'error',
            'success',
        ]);
    });
});

describe('dev seed coverage contract: Catalog search', () => {
    it('promises every Catalog-query status badge appears at least once', () => {
        const derived = new Set(plan.catalogQueries.map(query => deriveStatus(plan, query)));

        for (const status of catalogQueryStatuses) {
            expect({ status, present: derived.has(status) }).toEqual({ status, present: true });
        }
    });

    it('promises every Search run has evidence, within the schema bounds', () => {
        const resultsByRun = groupBy(plan.catalogSearchResults, result => result.runId);

        for (const run of plan.catalogSearchRuns) {
            const results = resultsByRun.get(String(run.id)) ?? [];
            expect(results.length).toBe(run.resultCount);
            expect(run.resultCount).toBeGreaterThan(0);
            expect(run.resultCount).toBeLessThanOrEqual(20);

            const positions = results.map(result => result.sourcePosition).sort((a, b) => a - b);
            expect(positions).toEqual(results.map((_, index) => index + 1));
            expect(new Set(results.map(result => result.productId)).size).toBe(results.length);
        }
    });

    it('promises both Search-run triggers are represented', () => {
        expect(distinct(plan.catalogSearchRuns, run => run.trigger).sort()).toEqual([
            'automatic',
            'requested',
        ]);
    });

    it('promises the Operations backing the runs satisfy the outcome invariant', () => {
        for (const operation of plan.operations) {
            if (operation.status === 'pending') {
                expect(operation.resource ?? null).toBeNull();
                expect(operation.error ?? null).toBeNull();
                expect(operation.completedAt ?? null).toBeNull();
                continue;
            }

            expect(operation.completedAt).toBeTruthy();
            expect((operation.resource ?? null) === null).not.toBe(
                (operation.error ?? null) === null
            );
        }
    });

    it('promises at most one pending Operation per query, as the unique index requires', () => {
        const pending = plan.operations.filter(operation => operation.status === 'pending');
        const keys = pending.map(operation => `${operation.type}:${operation.targetKey}`);

        expect(new Set(keys).size).toBe(keys.length);
        expect(pending.length).toBeGreaterThan(0);
    });

    it('promises every Search result points at a seeded Product', () => {
        const productIds = new Set(plan.products.map(product => product.id));

        for (const result of plan.catalogSearchResults) {
            expect(productIds.has(result.productId)).toBe(true);
        }
    });
});

describe('dev seed coverage contract: Top Search Terms', () => {
    it('promises enough consecutive days for the one-day and seven-day trend columns', () => {
        const days = plan.topSearchTermsDatasets
            .filter(dataset => dataset.reportPeriod === 'DAY')
            .map(dataset => dataset.dataEndDate)
            .sort();

        expect(days.length).toBeGreaterThanOrEqual(8);
        for (let index = 1; index < days.length; index += 1) {
            const previous = new Date(`${days[index - 1]}T00:00:00Z`).getTime();
            const current = new Date(`${days[index]}T00:00:00Z`).getTime();
            expect(current - previous).toBe(DAY_MS);
        }
    });

    it('promises the weekly window exists alongside the daily ones', () => {
        expect(
            distinct(plan.topSearchTermsDatasets, dataset => dataset.reportPeriod).sort()
        ).toEqual(['DAY', 'WEEK']);
    });

    it('promises every dataset is completed, so the Keywords page finds one to open', () => {
        for (const dataset of plan.topSearchTermsDatasets) {
            expect(dataset.status).toBe('completed');
            expect(dataset.refreshing).toBe(false);
            expect(dataset.lastCompletedAt).toBeTruthy();
        }
    });

    it('promises the merch-only filter both keeps and removes rows', () => {
        const relevant = plan.topSearchTermsKeywordDaily.filter(row => row.isMerchRelevant);
        const blocked = plan.topSearchTermsKeywordDaily.filter(row => !row.isMerchRelevant);

        expect(relevant.length).toBeGreaterThan(0);
        expect(blocked.length).toBeGreaterThan(0);
    });

    it('promises the classification is the shipped classifier, not a fixture flag', () => {
        for (const row of plan.topSearchTermsKeywordDaily) {
            const classification = classifyMerchKeyword(row.searchTerm);
            expect({ term: row.searchTerm, ...classification }).toEqual({
                term: row.searchTerm,
                isMerchRelevant: row.isMerchRelevant,
                merchReason: row.merchReason,
            });
        }
    });

    it('promises ranks move between days, so trend columns are not all zero', () => {
        const byTerm = groupBy(
            plan.topSearchTermsKeywordDaily.filter(row => row.reportPeriod === 'DAY'),
            row => row.searchTerm
        );
        const moved = [...byTerm.values()].filter(
            rows => new Set(rows.map(row => row.searchFrequencyRank)).size > 1
        );

        expect(moved.length).toBeGreaterThan(byTerm.size / 2);
    });

    it('promises every keyword row stays inside the basis-point range', () => {
        for (const row of plan.topSearchTermsKeywordDaily) {
            expect(row.clickShareTop3SumBasisPoints).toBeGreaterThanOrEqual(0);
            expect(row.clickShareTop3SumBasisPoints).toBeLessThanOrEqual(10_000);
            expect(row.conversionShareTop3SumBasisPoints).toBeLessThanOrEqual(10_000);
            expect(row.searchFrequencyRank).toBeGreaterThan(0);
        }
    });
});

describe('dev seed coverage contract: activity and observability', () => {
    it('promises every level and status the Logs filters offer selects something', () => {
        expect(distinct(plan.eventLogs, row => row.level).sort()).toEqual(
            [...eventLogLevels].sort()
        );
        expect(distinct(plan.eventLogs, row => row.status).sort()).toEqual(
            [...eventLogStatuses].sort()
        );
    });

    it('promises every primitive type the application emits appears, and no invented one', () => {
        // The declared vocabulary and the seeded one are the same set, in both
        // directions: a value nothing writes is a filter that always returns
        // nothing, and a value nothing seeds is a filter the seed cannot prove.
        const emitted = distinct(plan.eventLogs, row => row.primitiveType).sort();

        expect(emitted).toEqual([...eventLogPrimitiveTypes].sort());
    });

    it('promises the activity stream covers the generated week and stops at now', () => {
        const times = plan.eventLogs.map(row => (row.occurredAt as Date).getTime());

        expect(Math.max(...times)).toBeLessThanOrEqual(NOW.getTime());
        expect(NOW.getTime() - Math.min(...times)).toBeGreaterThan(
            (plan.options.dayCount - 1) * DAY_MS
        );
    });

    it('promises job executions show both outcomes and every one carries logs', () => {
        expect(distinct(plan.jobExecutions, row => row.status).sort()).toEqual([
            'failed',
            'success',
        ]);

        const logsByExecution = groupBy(plan.jobExecutionLogs, row => row.executionId);
        for (const execution of plan.jobExecutions) {
            expect((logsByExecution.get(String(execution.id)) ?? []).length).toBeGreaterThan(0);
            expect((execution.finishedAt as Date).getTime()).toBeGreaterThanOrEqual(
                (execution.startedAt as Date).getTime()
            );
        }
    });

    it('promises Provider telemetry covers both providers and includes failures', () => {
        expect(distinct(plan.providerAttempts, row => row.provider).sort()).toEqual([
            'keepa',
            'spapi',
        ]);
        expect(plan.providerAttempts.some(row => row.isError)).toBe(true);
        expect(plan.providerAttempts.some(row => !row.isError)).toBe(true);
        for (const attempt of plan.providerAttempts) {
            expect(attempt.latencyMs).toBeGreaterThanOrEqual(0);
        }
    });
});

const age = (value: Date | null | undefined) => NOW.getTime() - (value?.getTime() ?? 0);

const distinct = <T, V>(rows: readonly T[], select: (row: T) => V) => [
    ...new Set(rows.map(select)),
];

const groupBy = <T, K>(rows: readonly T[], select: (row: T) => K) => {
    const grouped = new Map<K, T[]>();
    for (const row of rows) {
        const key = select(row);
        const bucket = grouped.get(key);
        if (bucket) {
            bucket.push(row);
        } else {
            grouped.set(key, [row]);
        }
    }
    return grouped;
};

/** Reproduces how the Catalog read model derives a query's badge. */
const deriveStatus = (source: DevSeedPlan, query: DevSeedPlan['catalogQueries'][number]) => {
    const latestOperation = source.operations
        .filter(operation => operation.targetKey === query.id)
        .sort(
            (left, right) =>
                (right.updatedAt as Date).getTime() - (left.updatedAt as Date).getTime()
        )[0];
    const latestSuccessfulRunAt = query.latestSuccessfulRunAt ?? null;
    const completedAt = latestOperation?.completedAt ?? null;

    return deriveCatalogQueryStatus({
        activeUntil: query.activeUntil ?? null,
        hasFailedOperation:
            latestOperation?.status === 'completed' &&
            (latestOperation.error ?? null) !== null &&
            (!(latestSuccessfulRunAt && completedAt) || completedAt > latestSuccessfulRunAt),
        hasPendingOperation: latestOperation?.status === 'pending',
        latestSuccessfulRunAt,
        nextRefreshAttemptAt: query.nextRefreshAttemptAt ?? null,
        now: NOW,
    });
};
