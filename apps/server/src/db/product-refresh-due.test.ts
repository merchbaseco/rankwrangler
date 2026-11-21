import { describe, expect, it } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { products } from '@/db/schema';
import {
    keepaRefreshDueAt,
    spApiBlindspotTracked,
    spApiRefreshDueAt,
    spApiRefreshTracked,
} from './product-refresh-due';

const render = (fragment: ReturnType<typeof spApiRefreshTracked>) =>
    new PgDialect().sqlToQuery(fragment);

describe('product refresh due expressions', () => {
    it('excludes deleted listings from scheduled and blind-spot refreshes', () => {
        for (const fragment of [spApiRefreshTracked(products), spApiBlindspotTracked(products)]) {
            expect(render(fragment).sql).toContain(`"products"."amazon_listing_status" = 'active'`);
        }
    });

    // Index expressions must be immutable and identical to the listing's, so no bound parameters.
    it('renders every due expression without parameters, one interval per BSR tier', () => {
        const spApi = render(spApiRefreshDueAt(products));
        expect(spApi.params).toEqual([]);
        expect(spApi.sql).toContain(`WHEN "products"."root_category_bsr" < 200000 THEN`);
        expect(spApi.sql).toContain(`interval '86400 seconds'`);
        expect(spApi.sql).toContain(
            `ELSE "products"."sp_api_fetched_at" + interval '2592000 seconds'`
        );
        const keepa = render(keepaRefreshDueAt(products));
        expect(keepa.params).toEqual([]);
        expect(keepa.sql).toContain(`< 50000 THEN interval '86400 seconds'`);
        expect(keepa.sql).toContain(`< 300000 THEN interval '172800 seconds'`);
        expect(keepa.sql).toContain(`< 600000 THEN interval '604800 seconds'`);
        expect(keepa.sql).toContain(`ELSE interval '1209600 seconds'`);
    });
});
