import { DAY_MS, HOUR_MS, MINUTE_MS, shiftMs } from '@/dev-seed/time-offsets';
import type { BuilderContext, DevSeedPlan, PlanRows, SeedProduct } from '@/dev-seed/types';
import { SEED_MERCH_SEARCH_TERMS, seedAudienceForTerm } from '@/dev-seed/vocabulary';
import {
    CATALOG_QUERY_ACTIVE_WINDOW_MS,
    type CatalogQueryStatus,
} from '@/services/catalog-query-refresh-policy';

/**
 * Catalog queries and their immutable Search-run evidence.
 *
 * The Catalog page is mostly a status board, so the queries are laid out to
 * cover every state `deriveCatalogQueryStatus` can return rather than to look
 * uniformly healthy. Each generated status is produced by arranging the fields
 * the policy actually reads — activity window, last successful run, deferred
 * attempt, latest Operation outcome — so the badges stay correct if the policy
 * changes shape.
 */

const NORMALIZER_VERSION = 1;
const MAX_RESULTS_PER_RUN = 20;
const MIN_RESULTS_PER_RUN = 11;

/** One query per status, then the remainder spread across the healthy states. */
const COVERED_STATUSES: readonly CatalogQueryStatus[] = [
    'waiting',
    'due',
    'deferred',
    'expiringSoon',
    'pending',
    'failed',
    'inactive',
];

export interface SearchBuild {
    readonly catalogQueries: DevSeedPlan['catalogQueries'];
    readonly catalogSearchRuns: DevSeedPlan['catalogSearchRuns'];
    readonly catalogSearchResults: DevSeedPlan['catalogSearchResults'];
    readonly operations: DevSeedPlan['operations'];
}

export const buildSearch = (
    context: BuilderContext,
    seedProducts: readonly SeedProduct[],
    featuredTerms: readonly string[]
): SearchBuild => {
    const { random, now, marketplaceId, mintId, options } = context;
    const queries: PlanRows<'catalogQueries'> = [];
    const runs: PlanRows<'catalogSearchRuns'> = [];
    const results: PlanRows<'catalogSearchResults'> = [];
    const operations: PlanRows<'operations'> = [];
    const terms =
        featuredTerms.length > 0
            ? featuredTerms
            : random.shuffle(SEED_MERCH_SEARCH_TERMS).slice(0, options.queryCount);

    terms.forEach((term, index) => {
        const status =
            COVERED_STATUSES[index] ?? random.pick(['waiting', 'waiting', 'due', 'expiringSoon']);
        const queryId = mintId('catalogQuery');
        const shape = shapeForStatus(context, status);
        const runCount = status === 'inactive' ? 1 : random.int(1, 3);
        let latestSuccessfulRunAt: Date | null = null;

        for (let runIndex = runCount - 1; runIndex >= 0; runIndex -= 1) {
            // The newest run lands on the query's declared last-success time so
            // the status the policy derives matches the evidence on screen.
            const completedAt =
                runIndex === 0
                    ? shape.latestSuccessfulRunAt
                    : shiftMs(shape.latestSuccessfulRunAt, -runIndex * random.int(6, 9) * DAY_MS);
            const startedAt = shiftMs(completedAt, -random.int(900, 6000));
            const operationId = mintId('operation');
            const placed = placeForTerm(context, seedProducts, term);
            const ordered = [...placed].sort((left, right) => right.demand - left.demand);
            const runId = mintId('catalogRun');

            operations.push({
                id: operationId,
                type: 'catalogSearch',
                status: 'completed',
                targetKey: queryId,
                input: { marketplaceId, page: 0, term },
                resource: { queryId, resultCount: ordered.length, runId },
                error: null,
                dispatchedAt: startedAt,
                startedAt,
                completedAt,
                createdAt: startedAt,
                updatedAt: completedAt,
            });

            runs.push({
                id: runId,
                queryId,
                operationId,
                sourceStartedAt: startedAt,
                sourceCompletedAt: completedAt,
                trigger: runIndex === 0 && status === 'pending' ? 'requested' : 'automatic',
                resultCount: ordered.length,
                normalizerVersion: NORMALIZER_VERSION,
                createdAt: completedAt,
            });

            ordered.forEach((product, position) => {
                results.push({
                    id: mintId('catalogResult'),
                    runId,
                    productId: product.id,
                    sourcePosition: position + 1,
                    observedRootCategoryBsr: product.rootCategoryBsr,
                    observedNewPrice: product.currentNewPrice + random.int(-300, 300),
                    observedMonthlySold:
                        product.demand < 0.25 ? null : Math.round(product.demand ** 2 * 4000),
                    observedBsrAverage30: product.rootCategoryBsr,
                    observedBsrAverage90: product.rootCategoryBsr,
                    observedSalesRankDrops30: Math.round(product.demand * 30),
                    observedSalesRankDrops90: Math.round(product.demand * 90),
                    observedSalesRankDrops180: Math.round(product.demand * 180),
                    observedSalesRankDrops365: Math.round(product.demand * 365),
                    observedSourceUpdatedAt: shiftMs(completedAt, -random.int(5, 300) * MINUTE_MS),
                    createdAt: completedAt,
                });
            });

            if (runIndex === 0) {
                latestSuccessfulRunAt = completedAt;
            }
        }

        // The state-carrying Operation is written after the runs so it is the
        // newest row for this query, which is the one the read model reads.
        if (status === 'pending') {
            const dispatchedAt = shiftMs(now, -random.int(1, 25) * MINUTE_MS);
            operations.push({
                id: mintId('operation'),
                type: 'catalogSearch',
                status: 'pending',
                targetKey: queryId,
                input: { marketplaceId, page: 0, term },
                resource: null,
                error: null,
                dispatchedAt,
                startedAt: dispatchedAt,
                completedAt: null,
                createdAt: dispatchedAt,
                updatedAt: dispatchedAt,
            });
        }

        if (status === 'failed') {
            const failedAt = shiftMs(now, -random.int(1, 6) * HOUR_MS);
            operations.push({
                id: mintId('operation'),
                type: 'catalogSearch',
                status: 'completed',
                targetKey: queryId,
                input: { marketplaceId, page: 0, term },
                resource: null,
                error: { code: 'KEEPA_UPSTREAM_ERROR', message: 'Keepa returned HTTP 503.' },
                dispatchedAt: shiftMs(failedAt, -4000),
                startedAt: shiftMs(failedAt, -4000),
                completedAt: failedAt,
                createdAt: shiftMs(failedAt, -4000),
                updatedAt: failedAt,
            });
        }

        queries.push({
            id: queryId,
            source: 'keepa',
            marketplaceId,
            normalizedTerm: term,
            displayTerm: term,
            lastRequestedAt: shape.lastRequestedAt,
            activeUntil: shape.activeUntil,
            nextRefreshAttemptAt: shape.nextRefreshAttemptAt,
            lastRefreshAttemptAt: latestSuccessfulRunAt,
            latestSuccessfulRunAt,
            createdAt: shiftMs(shape.activeUntil, -CATALOG_QUERY_ACTIVE_WINDOW_MS),
            updatedAt: latestSuccessfulRunAt ?? now,
        });
    });

    return {
        catalogQueries: queries,
        catalogSearchResults: results,
        catalogSearchRuns: runs,
        operations,
    };
};

interface QueryShape {
    readonly activeUntil: Date;
    readonly lastRequestedAt: Date;
    readonly latestSuccessfulRunAt: Date;
    readonly nextRefreshAttemptAt: Date | null;
}

const shapeForStatus = (context: BuilderContext, status: CatalogQueryStatus): QueryShape => {
    const { now, random } = context;
    const active = (days: number) => shiftMs(now, days * DAY_MS);
    const ago = (days: number) => shiftMs(now, -days * DAY_MS);

    switch (status) {
        case 'inactive':
            return {
                activeUntil: ago(random.int(2, 9)),
                lastRequestedAt: ago(random.int(32, 50)),
                latestSuccessfulRunAt: ago(random.int(30, 44)),
                nextRefreshAttemptAt: null,
            };
        case 'due':
            return {
                activeUntil: active(random.int(14, 24)),
                lastRequestedAt: ago(random.int(8, 14)),
                latestSuccessfulRunAt: ago(random.int(8, 12)),
                nextRefreshAttemptAt: null,
            };
        case 'deferred':
            return {
                activeUntil: active(random.int(14, 24)),
                lastRequestedAt: ago(random.int(8, 14)),
                latestSuccessfulRunAt: ago(random.int(8, 12)),
                nextRefreshAttemptAt: shiftMs(now, random.int(20, 55) * MINUTE_MS),
            };
        case 'expiringSoon':
            return {
                activeUntil: active(random.int(1, 6)),
                lastRequestedAt: ago(random.int(24, 29)),
                latestSuccessfulRunAt: ago(random.int(1, 4)),
                nextRefreshAttemptAt: null,
            };
        default:
            return {
                activeUntil: active(random.int(9, 27)),
                lastRequestedAt: ago(random.int(1, 5)),
                latestSuccessfulRunAt: ago(random.int(1, 5)),
                nextRefreshAttemptAt: null,
            };
    }
};

/**
 * A term's results: its own niche (designs whose audience the term is about),
 * shuffled per run so placement moves between runs. A niche too thin to fill a
 * page falls back to a random handful, as a sparse real search would.
 */
const placeForTerm = (
    context: BuilderContext,
    seedProducts: readonly SeedProduct[],
    term: string
) => {
    const { random } = context;
    const audience = seedAudienceForTerm(term)?.name;
    const niche = seedProducts.filter(product => audience && product.audiences.includes(audience));
    if (niche.length >= 3) {
        return random.shuffle(niche).slice(0, MAX_RESULTS_PER_RUN);
    }
    return random
        .shuffle(seedProducts)
        .slice(0, random.int(MIN_RESULTS_PER_RUN, MAX_RESULTS_PER_RUN));
};
