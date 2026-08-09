import { describe, expect, it } from 'bun:test';
import { lt } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { products } from '@/db/schema';
import { buildAvailableMerchRefreshCondition } from './reprocess-stale-products';

describe('unavailable Product refresh policy', () => {
    it('excludes unavailable Products from scheduled stale refreshes', () => {
        const threshold = new Date('2026-07-09T12:00:00.000Z');
        const condition = buildAvailableMerchRefreshCondition(
            lt(products.spApiFetchedAt, threshold)
        );
        const query = new PgDialect().sqlToQuery(condition?.getSQL() ?? condition);

        expect(query.sql).toContain('"products"."is_unavailable" = $1');
        expect(query.sql).toContain('"products"."sp_api_fetched_at" < $2');
        expect(query.sql).not.toContain('sp_api_resolved_at');
        expect(query.params).toEqual([false, threshold.toISOString()]);
    });
});
