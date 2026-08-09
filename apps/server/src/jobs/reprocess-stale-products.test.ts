import { describe, expect, it } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildUnavailableRefreshCondition } from './reprocess-stale-products';

describe('unavailable Product refresh policy', () => {
    it('ages the successful not-found resolution instead of the older Product payload', () => {
        const threshold = new Date('2026-07-09T12:00:00.000Z');
        const condition = buildUnavailableRefreshCondition(threshold);
        const query = new PgDialect().sqlToQuery(condition?.getSQL() ?? condition);

        expect(query.sql).toContain('"products"."is_unavailable" = $1');
        expect(query.sql).toContain('"products"."sp_api_resolved_at" < $2');
        expect(query.sql).not.toContain('sp_api_fetched_at');
        expect(query.params).toEqual([true, threshold.toISOString()]);
    });
});
