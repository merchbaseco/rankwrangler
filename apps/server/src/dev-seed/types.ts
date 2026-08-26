import type { DevSeedIdMinter } from '@/dev-seed/identity';
import type { SeededRandom } from '@/dev-seed/random';
import type {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    eventLogs,
    jobExecutionLogs,
    jobExecutions,
    keepaCategories,
    operations,
    productFacets,
    productFacetValues,
    productHistoryImports,
    productHistoryPoints,
    products,
    providerAttempts,
    topSearchTermsDatasets,
    topSearchTermsKeywordDaily,
    topSearchTermsSnapshots,
} from '@/db/schema';

export interface DevSeedOptions {
    /** RNG seed. The same string always produces the same week. */
    readonly seed: string;
    /** Anchor for every generated timestamp. Never read inside a builder. */
    readonly now: Date;
    /** Products in the synthetic catalog. */
    readonly productCount: number;
    /** Days of Product history, keyword snapshots, and activity to generate. */
    readonly dayCount: number;
    /** Catalog queries carrying Search-run history. */
    readonly queryCount: number;
}

/**
 * Rows are typed as Drizzle inserts so the plan cannot drift from the schema,
 * and so the writer hands the same values the runtime would write.
 */
export interface DevSeedPlan {
    readonly marketplaceId: string;
    readonly options: DevSeedOptions;
    readonly catalogQueries: readonly (typeof catalogQueries.$inferInsert)[];
    readonly catalogSearchResults: readonly (typeof catalogSearchResults.$inferInsert)[];
    readonly catalogSearchRuns: readonly (typeof catalogSearchRuns.$inferInsert)[];
    readonly eventLogs: readonly (typeof eventLogs.$inferInsert)[];
    readonly jobExecutionLogs: readonly (typeof jobExecutionLogs.$inferInsert)[];
    readonly jobExecutions: readonly (typeof jobExecutions.$inferInsert)[];
    readonly keepaCategories: readonly (typeof keepaCategories.$inferInsert)[];
    readonly operations: readonly (typeof operations.$inferInsert)[];
    readonly productFacetValues: readonly (typeof productFacetValues.$inferInsert)[];
    readonly productFacets: readonly (typeof productFacets.$inferInsert)[];
    readonly productHistoryImports: readonly (typeof productHistoryImports.$inferInsert)[];
    readonly productHistoryPoints: readonly (typeof productHistoryPoints.$inferInsert)[];
    readonly products: readonly (typeof products.$inferInsert)[];
    readonly providerAttempts: readonly (typeof providerAttempts.$inferInsert)[];
    readonly topSearchTermsDatasets: readonly (typeof topSearchTermsDatasets.$inferInsert)[];
    readonly topSearchTermsKeywordDaily: readonly (typeof topSearchTermsKeywordDaily.$inferInsert)[];
    readonly topSearchTermsSnapshots: readonly (typeof topSearchTermsSnapshots.$inferInsert)[];
}

/** Every named row list in a plan, in the order the writer inserts them. */
export const DEV_SEED_TABLE_KEYS = [
    'keepaCategories',
    'products',
    'productFacetValues',
    'productFacets',
    'productHistoryImports',
    'productHistoryPoints',
    'catalogQueries',
    'operations',
    'catalogSearchRuns',
    'catalogSearchResults',
    'topSearchTermsDatasets',
    'topSearchTermsSnapshots',
    'topSearchTermsKeywordDaily',
    'jobExecutions',
    'jobExecutionLogs',
    'eventLogs',
    'providerAttempts',
] as const satisfies readonly (keyof DevSeedPlan)[];

export type DevSeedTableKey = (typeof DEV_SEED_TABLE_KEYS)[number];

/** The mutable element type of one plan list, for builders that accumulate. */
export type PlanRows<K extends DevSeedTableKey> = DevSeedPlan[K] extends readonly (infer Row)[]
    ? Row[]
    : never;

export const summarizePlan = (plan: DevSeedPlan): Record<DevSeedTableKey, number> =>
    Object.fromEntries(DEV_SEED_TABLE_KEYS.map(key => [key, plan[key].length])) as Record<
        DevSeedTableKey,
        number
    >;

/** A generated Product, carried between builders that must agree about it. */
export interface SeedProduct {
    readonly id: string;
    readonly asin: string;
    readonly title: string;
    readonly rootCategoryId: number;
    readonly rootCategoryBsr: number | null;
    readonly currentNewPrice: number;
    readonly keepaFetchedAt: Date;
    /** Demand weight in (0, 1]; drives rank, drops, and Search placement. */
    readonly demand: number;
    /** Whether this Product carries a history series the chart can render. */
    readonly hasHistory: boolean;
}

export interface BuilderContext {
    readonly random: SeededRandom;
    readonly now: Date;
    readonly marketplaceId: string;
    readonly options: DevSeedOptions;
    readonly mintId: DevSeedIdMinter;
}
