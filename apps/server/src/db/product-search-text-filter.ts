import { and, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ProductCatalogFilterInput } from '@/api/product-search-input';
import { products } from './product-schema';
import { productSearchDocument } from './product-search-document';

const asinPattern = /^[A-Z0-9]{10}$/i;

export const productSearchTextFilter = (input: ProductCatalogFilterInput) => {
    const document =
        input.textFields === 'title'
            ? sql`to_tsvector('simple', coalesce(${products.title}, ''))`
            : productSearchDocument(products);
    const query = input.term ? sql`plainto_tsquery('simple', ${input.term})` : null;
    const relevance = query ? sql<number>`ts_rank(${document}, ${query})` : sql<number>`0::real`;
    const conditions: Array<SQL | undefined> = [];
    if (query) {
        const lexical = alias(products, 'lexical');
        const lexicalDocument = productSearchDocument(lexical);
        const lexicalMatch = asinPattern.test(input.term ?? '')
            ? or(
                  sql`${lexicalDocument} @@ ${query}`,
                  eq(lexical.asin, input.term?.toUpperCase() ?? '')
              )
            : sql`${lexicalDocument} @@ ${query}`;
        const lexicalMarkets = input.marketplaceIds.length
            ? inArray(lexical.marketplaceId, input.marketplaceIds)
            : sql`true`;
        const membership =
            input.textFields === 'all'
                ? sql`union
            select kp.product_id from keyword_products kp
            join catalog_queries cq on cq.id = kp.query_id
            where cq.source = 'keepa' and cq.marketplace_id = 'ATVPDKIKX0DER'
                and cq.normalized_term = ${input.term?.trim().replace(/\s+/g, ' ').toLowerCase()}
        `
                : sql``;
        conditions.push(sql`${products.id} in (
            select ${lexical.id} from ${products} as lexical where ${lexicalMarkets} and (${lexicalMatch})
                ${input.textFields === 'title' ? sql`and (to_tsvector('simple', coalesce(${lexical.title}, '')) @@ ${query} or ${lexical.asin} = ${input.term?.toUpperCase() ?? ''})` : sql``}
            ${membership}
        )`);
    }
    for (const word of input.excludeWords) {
        conditions.push(sql`not (${document} @@ plainto_tsquery('simple', ${word}))`);
    }
    return { where: and(...conditions), relevance };
};
