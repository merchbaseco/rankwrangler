import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { buildActivity } from '@/dev-seed/build-activity';
import { buildCatalog } from '@/dev-seed/build-catalog';
import { buildHistory } from '@/dev-seed/build-history';
import { buildKeywords } from '@/dev-seed/build-keywords';
import { buildSearch } from '@/dev-seed/build-search';
import { createIdMinter } from '@/dev-seed/identity';
import { createSeededRandom } from '@/dev-seed/random';
import type { BuilderContext, DevSeedOptions, DevSeedPlan } from '@/dev-seed/types';

/**
 * Assembles the whole synthetic week in memory before anything is written, so
 * the plan can be asserted in a unit test with no database and the writer stays
 * a single transaction over finished rows.
 */

export const DEV_SEED_DEFAULTS = {
    dayCount: 7,
    productCount: 64,
    queryCount: 10,
    seed: 'rankwrangler-dev',
} as const;

export const buildDevSeedPlan = (overrides: Partial<DevSeedOptions> = {}): DevSeedPlan => {
    const options: DevSeedOptions = {
        dayCount: overrides.dayCount ?? DEV_SEED_DEFAULTS.dayCount,
        now: overrides.now ?? new Date(),
        productCount: overrides.productCount ?? DEV_SEED_DEFAULTS.productCount,
        queryCount: overrides.queryCount ?? DEV_SEED_DEFAULTS.queryCount,
        seed: overrides.seed ?? DEV_SEED_DEFAULTS.seed,
    };

    const context: BuilderContext = {
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        mintId: createIdMinter(),
        now: options.now,
        options,
        random: createSeededRandom(options.seed),
    };

    const catalog = buildCatalog(context);
    const history = buildHistory(context, catalog.seedProducts);
    const search = buildSearch(context, catalog.seedProducts);
    const keywords = buildKeywords(context);
    const activity = buildActivity(context, catalog.seedProducts);

    return {
        catalogQueries: search.catalogQueries,
        catalogSearchResults: search.catalogSearchResults,
        catalogSearchRuns: search.catalogSearchRuns,
        eventLogs: activity.eventLogs,
        jobExecutionLogs: activity.jobExecutionLogs,
        jobExecutions: activity.jobExecutions,
        keepaCategories: catalog.keepaCategories,
        marketplaceId: context.marketplaceId,
        operations: search.operations,
        options,
        productFacetValues: catalog.productFacetValues,
        productFacets: catalog.productFacets,
        productHistoryImports: history.productHistoryImports,
        productHistoryPoints: history.productHistoryPoints,
        products: catalog.products,
        providerAttempts: activity.providerAttempts,
        topSearchTermsDatasets: keywords.topSearchTermsDatasets,
        topSearchTermsKeywordDaily: keywords.topSearchTermsKeywordDaily,
        topSearchTermsSnapshots: keywords.topSearchTermsSnapshots,
    };
};
