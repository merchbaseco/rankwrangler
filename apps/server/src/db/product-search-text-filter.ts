import { and, eq, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ProductCatalogFilterInput } from '@/api/product-search-input';
import { db } from './index';
import { products } from './product-schema';
import { productSearchDocument } from './product-search-document';

const asinPattern = /^[A-Z0-9]{10}$/i;

/**
 * Text matches up to this many (the planner's estimate) are looked up through the search
 * document's GIN index and ranked by relevance; a commoner term is checked per row instead.
 */
export const TEXT_LOOKUP_LIMIT = 10_000;

/**
 * How a term narrows the search. Matching is on the title alone; the search document's GIN index
 * (title, brand, bullets) finds the candidates, and the title must then match too. `lookup`
 * collects every match through that index and is right for a rare term: it touches only the
 * matches. `row` tests each Product the read visits, so a common term costs only the rows a page
 * or sample walks instead of fetching hundreds of thousands of matches first; it cannot rank by
 * relevance without ranking every match, so relevance sorts by sales rank in that form.
 */
export type ProductTextForm = 'lookup' | 'row';

/**
 * The term's WHERE condition plus `relevance`, the title's text rank in [0, 1) (normalization 32,
 * rank / (rank + 1)), so a caller can add whole-number ranking tiers above it. Excluded words are
 * tested against the title too.
 */
export const productSearchTextFilter = (
    input: ProductCatalogFilterInput,
    form: ProductTextForm = 'lookup'
) => {
    const title = titleVector(products.title);
    const query = input.term ? sql`plainto_tsquery('simple', ${input.term})` : null;
    const relevance = query
        ? sql<number>`ts_rank(${title}, ${query}, 32)::float8`
        : sql<number>`0::float8`;
    const conditions: Array<SQL | undefined> = [];
    if (query) {
        conditions.push(form === 'row' ? rowMatch(input, query) : lookupMatch(input, query));
    }
    for (const word of input.excludeWords) {
        conditions.push(sql`not (${title} @@ plainto_tsquery('simple', ${word}))`);
    }
    return { where: and(...conditions), relevance };
};

/**
 * The planner's estimate of Products whose search document matches the term; plain EXPLAIN, so
 * nothing is read. Null without a term.
 */
export const estimateTextMatches = async (input: ProductCatalogFilterInput) => {
    if (!input.term) return null;
    const [plan] = await db.execute<{ 'QUERY PLAN': [{ Plan: { 'Plan Rows': number } }] }>(sql`
        explain (format json) select 1 from ${products}
        where ${productSearchDocument(products)} @@ plainto_tsquery('simple', ${input.term})`);
    return Math.round(plan?.['QUERY PLAN']?.[0]?.Plan?.['Plan Rows'] ?? 0);
};

/** The text form for a term: `lookup` while its estimated matches stay within the limit. */
export const chooseTextForm = async (input: ProductCatalogFilterInput) => {
    const matches = await estimateTextMatches(input);
    return matches !== null && matches > TEXT_LOOKUP_LIMIT ? 'row' : 'lookup';
};

const lookupMatch = (input: ProductCatalogFilterInput, query: SQL) => {
    const lexical = alias(products, 'lexical');
    const term = input.term?.toUpperCase() ?? '';
    const asin = asinPattern.test(term);
    const candidate = sql`${productSearchDocument(lexical)} @@ ${query}`;
    const titleMatch = sql`${titleVector(lexical.title)} @@ ${query}`;
    return sql`${products.id} in (
            select ${lexical.id} from ${products} as lexical
            where ${eq(lexical.marketplaceId, input.marketplaceId)}
                and ${asin ? or(and(candidate, titleMatch), eq(lexical.asin, term)) : and(candidate, titleMatch)}
        )`;
};

/** The same Products as `lookupMatch`, tested on the row itself. */
const rowMatch = (input: ProductCatalogFilterInput, query: SQL) => {
    const term = input.term?.toUpperCase() ?? '';
    const textMatch = and(
        sql`${productSearchDocument(products)} @@ ${query}`,
        sql`${titleVector(products.title)} @@ ${query}`
    );
    return asinPattern.test(term)
        ? sql`(${or(textMatch, eq(products.asin, term))})`
        : sql`(${textMatch})`;
};

const titleVector = (title: SQLWrapper) => sql`to_tsvector('simple', coalesce(${title}, ''))`;
