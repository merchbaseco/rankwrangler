import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
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
import { DEV_SEED_UUID_LIKE } from '@/dev-seed/identity';
import { DEV_SEED_TABLE_KEYS, type DevSeedPlan, type DevSeedTableKey } from '@/dev-seed/types';

/**
 * Clear, then refill, in one transaction.
 *
 * The clear is scoped by the marker every seeded row carries in its own primary
 * key, so a re-run replaces the previous synthetic week and leaves alone
 * anything a developer collected by hand against the same local database. That
 * is what makes the command idempotent: run it twice and the database looks the
 * same, not doubled.
 *
 * Order matters in one place. `catalog_search_results` references `products`
 * with `on delete restrict`, so Search evidence is cleared before the Products
 * it points at; everything else either cascades or is independent.
 *
 * One caveat is worth stating rather than hiding. Catalog-query identity is
 * (source, marketplace, term, page), so a real search for a term the seed
 * invented reuses the seeded query row, and clearing that row cascades to the
 * real Search run hanging off it. Nothing else a developer collects is reachable
 * this way, and the query returns on the next run with fresh evidence.
 */

/** Reverse dependency order. Cascades cover the child rows each delete implies. */
const CLEAR_STEPS = [
    { column: 'id', table: catalogSearchResults },
    { column: 'id', table: catalogSearchRuns },
    { column: 'id', table: catalogQueries },
    { column: 'id', table: operations },
    { column: 'id', table: topSearchTermsKeywordDaily },
    { column: 'id', table: topSearchTermsSnapshots },
    { column: 'id', table: topSearchTermsDatasets },
    { column: 'id', table: productHistoryPoints },
    { column: 'id', table: productHistoryImports },
    { column: 'product_id', table: productFacets },
    { column: 'id', table: productFacetValues },
    { column: 'id', table: products },
    { column: 'id', table: keepaCategories },
    { column: 'id', table: jobExecutionLogs },
    { column: 'id', table: jobExecutions },
    { column: 'id', table: eventLogs },
    { column: 'id', table: providerAttempts },
] as const;

const INSERT_TABLES: Record<DevSeedTableKey, Parameters<typeof db.insert>[0]> = {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    eventLogs,
    jobExecutionLogs,
    jobExecutions,
    keepaCategories,
    operations,
    productFacetValues,
    productFacets,
    productHistoryImports,
    productHistoryPoints,
    products,
    providerAttempts,
    topSearchTermsDatasets,
    topSearchTermsKeywordDaily,
    topSearchTermsSnapshots,
};

/** Postgres caps a statement at 65535 bindings; history points are the widest rows. */
const INSERT_CHUNK_SIZE = 500;

export interface DevSeedWriteReport {
    readonly cleared: number;
    readonly inserted: Record<DevSeedTableKey, number>;
}

export const writeDevSeedPlan = async (plan: DevSeedPlan): Promise<DevSeedWriteReport> => {
    const inserted = {} as Record<DevSeedTableKey, number>;

    return await db.transaction(async tx => {
        let cleared = 0;
        for (const step of CLEAR_STEPS) {
            const result = await tx.execute(
                sql`DELETE FROM ${step.table}
                    WHERE ${sql.identifier(step.column)}::text LIKE ${DEV_SEED_UUID_LIKE}`
            );
            cleared += Number(result.count ?? 0);
        }

        for (const key of DEV_SEED_TABLE_KEYS) {
            const rows = plan[key];
            inserted[key] = rows.length;
            for (let offset = 0; offset < rows.length; offset += INSERT_CHUNK_SIZE) {
                const chunk = rows.slice(offset, offset + INSERT_CHUNK_SIZE);
                if (chunk.length > 0) {
                    await tx.insert(INSERT_TABLES[key]).values(chunk as never);
                }
            }
        }

        return { cleared, inserted };
    });
};
