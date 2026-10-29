import { type SQLWrapper, sql } from 'drizzle-orm';

type ProductSearchFields = Readonly<{
    title: SQLWrapper;
    brand: SQLWrapper;
    bullet1: SQLWrapper;
    bullet2: SQLWrapper;
}>;

export const productSearchDocument = (fields: ProductSearchFields) => sql`(
    setweight(to_tsvector('simple', coalesce(${fields.title}, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(${fields.brand}, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(${fields.bullet1}, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(${fields.bullet2}, '')), 'C')
)`;
