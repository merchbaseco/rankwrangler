import { createHash } from 'node:crypto';
import {
    and,
    eq,
    gt,
    isNotNull,
    isNull,
    lt,
    or,
    type SQL,
    type SQLWrapper,
    sql,
} from 'drizzle-orm';
import { z } from 'zod';
import type { ProductSearchInput } from '@/api/product-search-input';
import { products } from './product-schema';

type CursorCast = 'real' | 'integer' | 'timestamp';
interface SortDefinition {
    column: SQLWrapper;
    ascending: boolean;
    cast: CursorCast;
}

export const productSearchUpdatedAt = sql<Date>`greatest(
    coalesce(${products.spApiFetchedAt}, '-infinity'::timestamp),
    coalesce(${products.spApiResolvedAt}, '-infinity'::timestamp),
    coalesce(${products.keepaFetchedAt}, '-infinity'::timestamp), ${products.createdAt}
)`.mapWith(products.createdAt);

const cursorSchema = z.object({
    scope: z.string(),
    id: z.uuid(),
    value: z.string().max(100).nullable(),
});
export class InvalidProductSearchCursorError extends Error {}

export const productSearchSort = (input: ProductSearchInput, relevance: SQL<number>) => {
    const sort = input.sort === 'relevance' && !input.term ? 'discoveredAtDesc' : input.sort;
    const definitions = {
        relevance: { column: relevance, ascending: false, cast: 'real' },
        salesRankAsc: { column: products.rootCategoryBsr, ascending: true, cast: 'integer' },
        salesRankDesc: { column: products.rootCategoryBsr, ascending: false, cast: 'integer' },
        firstAvailableAtAsc: {
            column: products.dateFirstAvailable,
            ascending: true,
            cast: 'timestamp',
        },
        firstAvailableAtDesc: {
            column: products.dateFirstAvailable,
            ascending: false,
            cast: 'timestamp',
        },
        discoveredAtDesc: { column: products.createdAt, ascending: false, cast: 'timestamp' },
        updatedAtAsc: { column: productSearchUpdatedAt, ascending: true, cast: 'timestamp' },
        updatedAtDesc: { column: productSearchUpdatedAt, ascending: false, cast: 'timestamp' },
        priceAsc: { column: products.keepaCurrentNewPrice, ascending: true, cast: 'integer' },
        priceDesc: { column: products.keepaCurrentNewPrice, ascending: false, cast: 'integer' },
        monthlySoldDesc: { column: products.keepaMonthlySold, ascending: false, cast: 'integer' },
    } satisfies Record<ProductSearchInput['sort'], SortDefinition>;
    const definition = definitions[sort];
    const { cursor: _cursor, limit: _limit, ...filters } = input;
    const scope = createHash('sha256').update(JSON.stringify(filters)).digest('base64url');
    let after: SQL | undefined;
    if (input.cursor) {
        const cursor = decodeCursor(input.cursor);
        if (cursor.scope !== scope) {
            throw new InvalidProductSearchCursorError('Cursor does not match search.');
        }
        const tie = gt(products.id, cursor.id);
        if (cursor.value === null) {
            after = and(isNull(definition.column), tie);
        } else {
            const valid = validCursorValue(cursor.value, definition.cast);
            if (!valid) {
                throw new InvalidProductSearchCursorError('Invalid search cursor value.');
            }
            const value = sql`${cursor.value}::${sql.raw(definition.cast)}`;
            after = or(
                isNull(definition.column),
                and(
                    isNotNull(definition.column),
                    or(
                        definition.ascending
                            ? gt(sql`${definition.column}`, value)
                            : lt(sql`${definition.column}`, value),
                        and(eq(sql`${definition.column}`, value), tie)
                    )
                )
            );
        }
    }
    return {
        after,
        value: sql<string | null>`(${definition.column})::text`,
        order: [
            sql`${definition.column} ${sql.raw(definition.ascending ? 'asc' : 'desc')} nulls last`,
            sql`${products.id} asc`,
        ],
        encode: (row: { id: string; sortValue: string | null }) =>
            Buffer.from(JSON.stringify({ scope, id: row.id, value: row.sortValue })).toString(
                'base64url'
            ),
    };
};

const decodeCursor = (value: string) => {
    try {
        return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    } catch {
        throw new InvalidProductSearchCursorError('Invalid search cursor.');
    }
};

const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;

const validCursorValue = (value: string, cast: CursorCast) => {
    if (cast === 'timestamp') {
        return (
            timestampPattern.test(value) &&
            Number.isFinite(Date.parse(`${value.replace(' ', 'T')}Z`))
        );
    }
    const numeric = Number(value);
    return (
        value.trim() !== '' &&
        Number.isFinite(numeric) &&
        (cast !== 'integer' ||
            (Number.isInteger(numeric) && numeric >= -2_147_483_648 && numeric <= 2_147_483_647))
    );
};
