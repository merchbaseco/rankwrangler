import { and, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
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
 * How a term narrows the search. `lookup` collects every match through the GIN index (plus the
 * keyword's stored members) and is right for a rare term: it touches only the matches. `row`
 * tests each Product the read visits, so a common term costs only the rows a page or sample
 * walks instead of fetching hundreds of thousands of matches first; it cannot rank by relevance
 * without ranking every match, so relevance sorts by sales rank in that form.
 */
export type ProductTextForm = 'lookup' | 'row';

export const productSearchTextFilter = (
    input: ProductCatalogFilterInput,
    form: ProductTextForm = 'lookup'
) => {
    const document =
        input.textFields === 'title'
            ? sql`to_tsvector('simple', coalesce(${products.title}, ''))`
            : productSearchDocument(products);
    const query = input.term ? sql`plainto_tsquery('simple', ${input.term})` : null;
    const relevance = query ? sql<number>`ts_rank(${document}, ${query})` : sql<number>`0::real`;
    const conditions: Array<SQL | undefined> = [];
    if (query) {
        conditions.push(form === 'row' ? rowMatch(input, query) : lookupMatch(input, query));
    }
    for (const word of input.excludeWords) {
        conditions.push(sql`not (${document} @@ plainto_tsquery('simple', ${word}))`);
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
    const lexicalDocument = productSearchDocument(lexical);
    const lexicalMatch = asinPattern.test(input.term ?? '')
        ? or(sql`${lexicalDocument} @@ ${query}`, eq(lexical.asin, input.term?.toUpperCase() ?? ''))
        : sql`${lexicalDocument} @@ ${query}`;
    const lexicalMarkets = input.marketplaceIds.length
        ? inArray(lexical.marketplaceId, input.marketplaceIds)
        : sql`true`;
    const membership = input.textFields === 'all' ? sql`union ${keywordMembers(input)}` : sql``;
    return sql`${products.id} in (
            select ${lexical.id} from ${products} as lexical where ${lexicalMarkets} and (${lexicalMatch})
                ${input.textFields === 'title' ? sql`and (to_tsvector('simple', coalesce(${lexical.title}, '')) @@ ${query} or ${lexical.asin} = ${input.term?.toUpperCase() ?? ''})` : sql``}
            ${membership}
        )`;
};

/** The same Products as `lookupMatch`, tested on the row itself. */
const rowMatch = (input: ProductCatalogFilterInput, query: SQL) => {
    const term = input.term?.toUpperCase() ?? '';
    const asin = asinPattern.test(input.term ?? '');
    const documentMatch = asin
        ? or(sql`${productSearchDocument(products)} @@ ${query}`, eq(products.asin, term))
        : sql`${productSearchDocument(products)} @@ ${query}`;
    const textMatch =
        input.textFields === 'title'
            ? and(
                  documentMatch,
                  sql`(to_tsvector('simple', coalesce(${products.title}, '')) @@ ${query} or ${products.asin} = ${term})`
              )
            : documentMatch;
    return input.textFields === 'all'
        ? sql`(${textMatch} or ${products.id} in (${keywordMembers(input)}))`
        : sql`(${textMatch})`;
};

// The keyword's stored members: Products a Keepa scan of exactly this term returned.
const keywordMembers = (input: ProductCatalogFilterInput) => sql`
            select kp.product_id from keyword_products kp
            join catalog_queries cq on cq.id = kp.query_id
            where cq.source = 'keepa' and cq.marketplace_id = 'ATVPDKIKX0DER'
                and cq.normalized_term = ${input.term?.trim().replace(/\s+/g, ' ').toLowerCase()}
        `;
