import { type SQL, sql } from 'drizzle-orm';
import type { ProductCatalogFilterInput } from '@/api/product-search-input';
import { db } from './index';
import { products } from './product-schema';
import { productSearchFilters } from './product-search-filters';
import { chooseTextForm } from './product-search-text-filter';

/** Explore aggregates count every match exactly while an index finds at most this many. */
export const EXACT_SCOPE_ROWS = 20_000;
/** Heap pages a sampled aggregate reads: about 5% of 72,000 pages, roughly 47,000 Products. */
export const SAMPLE_SCOPE_PAGES = 4_000;
const SAMPLE_SEED = 17;

/**
 * Which Products an Explore aggregate (facets, improvement share, seasonality) reads.
 * `all` reads every match; it is chosen only when the planner reaches the matches through an
 * index and expects at most EXACT_SCOPE_ROWS, and the read stops after EXACT_SCOPE_ROWS + 1 so a
 * wrong estimate cannot turn it into a scan. Otherwise `sample` reads a fixed, repeatable block
 * sample of SAMPLE_SCOPE_PAGES pages (TABLESAMPLE SYSTEM) and counts are scaled up from it, so
 * no request reads more than that many pages, however broad or unindexed its filters.
 */
export type ProductScope = 'all' | 'sample';

export const chooseProductScope = async (
    input: ProductCatalogFilterInput,
    now: Date,
    filter: 'base' | 'where'
): Promise<ProductScope> => {
    const text = await chooseTextForm(input);
    if (text === 'row') return 'sample';
    const plan = await planProductRead(productSearchFilters(input, now, text)[filter]);
    return !plan.scansTable && plan.rows <= EXACT_SCOPE_ROWS ? 'all' : 'sample';
};

/** The filters a scope reads under: a sample tests text per row, never through a lookup. */
export const scopeFilters = (input: ProductCatalogFilterInput, now: Date, scope: ProductScope) =>
    productSearchFilters(input, now, scope === 'sample' ? 'row' : 'lookup');

/** The FROM item for a scope, aliased `products` so the filters bind to it. */
export const scopeSource = (scope: ProductScope) =>
    scope === 'all'
        ? sql`${products}`
        : sql`${products} tablesample system ((${samplePercent})) repeatable (${sql.raw(String(SAMPLE_SEED))})`;

/** The row cap a scope's read carries: `all` stops one past EXACT_SCOPE_ROWS. */
export const scopeLimit = (scope: ProductScope) =>
    scope === 'all' ? sql`limit ${sql.raw(String(EXACT_SCOPE_ROWS + 1))}` : sql``;

/** The share of pages a sample reads, in percent; 100 when the table is that small. */
export const samplePercent = sql`select least(100, 100.0 * ${sql.raw(String(SAMPLE_SCOPE_PAGES))}
    / greatest(relpages, 1))::float8 from pg_class where oid = 'products'::regclass`;

/**
 * The planner's view of reading the Products `where` matches: estimated rows, and whether the
 * plan reads a large `products` table sequentially (`scansTable`). A table under
 * SMALL_TABLE_ROWS reads whole in moments, so it never counts as a scan. Plain EXPLAIN and a
 * catalog lookup, run together; no Products are read.
 */
export const planProductRead = async (where: SQL | undefined) => {
    const [[row], [table]] = await Promise.all([
        db.execute<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
            sql`explain (format json) select 1 from ${products} where ${where ?? sql`true`}`
        ),
        db.execute<{ rows: number }>(
            sql`select reltuples::float8 "rows" from pg_class where oid = 'products'::regclass`
        ),
    ]);
    const root = row?.['QUERY PLAN']?.[0]?.Plan;
    return {
        rows: Math.round(root?.['Plan Rows'] ?? 0),
        scansTable: Number(table?.rows ?? 0) > SMALL_TABLE_ROWS && (!root || scansProducts(root)),
    };
};

/** Below this many Products (planner statistics) a sequential read is cheap enough to count. */
const SMALL_TABLE_ROWS = 100_000;

interface PlanNode {
    'Node Type': string;
    'Relation Name'?: string;
    'Plan Rows': number;
    Plans?: PlanNode[];
}

const scansProducts = (node: PlanNode): boolean =>
    (node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'products') ||
    (node.Plans ?? []).some(scansProducts);
