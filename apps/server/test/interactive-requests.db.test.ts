import { afterAll, beforeAll, describe, expect, it, setSystemTime } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { Context } from '@/api/context';
import { keywordDirectoryFacetsInput } from '@/api/keyword-directory-input';
import { appRouter } from '@/api/router';
import { db, runBackground, runInteractive } from '@/db/index';
import { readKeywordDirectoryFacets } from '@/db/keyword-directory-facets';
import {
    eventLogs,
    jobExecutions,
    keepaCategories,
    productFacetValues,
    productShortNames,
    providerAttempts,
} from '@/db/schema';
import { mintSeedAsin } from '@/dev-seed/identity';
import { buildDevSeedPlan } from '@/dev-seed/plan';
import { writeDevSeedPlan } from '@/dev-seed/write-plan';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { resetDiscoveryFixture } from './discovery-fixture';

// The dashboard's real request paths, called through the tRPC router inside `runInteractive` as the
// server wraps `/api/` requests, against the synthetic development week, and compared with the
// same call on the unwrapped background pool.
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('interactive request paths', () => {
    const caller = appRouter.createCaller(adminContext());
    const now = new Date();
    const view = { asOf: new Date(now.getTime() + 60_000).toISOString(), sort: 'newest' as const };

    // Reads anchor on the clock; both sides of a comparison must see the same instant.
    beforeAll(async () => {
        setSystemTime(now);
        await resetDiscoveryFixture();
        // Earlier files leave facet values and categories whose natural keys the seed reuses.
        await db.execute(sql`truncate ${productFacetValues}, ${keepaCategories} cascade`);
        await writeDevSeedPlan(buildDevSeedPlan({ now }));
    });
    // Later files count provider calls, events and jobs, so the synthetic week leaves with us.
    afterAll(async () => {
        setSystemTime();
        await resetDiscoveryFixture();
        await db.execute(
            sql`truncate ${providerAttempts}, ${eventLogs}, ${jobExecutions}, ${productFacetValues},
                ${keepaCategories}, ${productShortNames} cascade`
        );
    });

    it('serves the keyword directory, its rows and its stage counts', async () => {
        const directory = await onBothPools(() =>
            caller.api.app.keywordDirectory({ stage: [], page: 1, pageSize: 25, sort: 'newest' })
        );
        expect(directory.interactive.items.length).toBeGreaterThan(5);
        expect(directory.interactive).toEqual(directory.background);

        const terms = directory.interactive.items.slice(0, 10).map(item => item.term);
        const rows = await onBothPools(() => caller.api.app.keywordDirectoryRows({ terms, view }));
        expect(rows.interactive.map(row => row.term).sort()).toEqual([...terms].sort());
        expect(rows.interactive).toEqual(rows.background);

        const counts = await onBothPools(() => caller.api.app.keywordDirectoryCounts({}));
        expect(Object.values(counts.interactive).some(count => Number(count) > 0)).toBe(true);
        expect(counts.interactive).toEqual(counts.background);
    });

    it('serves the keyword facets the background read derives', async () => {
        // The procedure caches by input, so the first (interactive) call reads the database and the
        // background side calls the uncached reader directly.
        const input = { search: 'a', stage: [] };
        const interactive = await runInteractive(() =>
            caller.api.app.keyword.directoryFacets(input)
        );
        const background = await runBackground(() =>
            readKeywordDirectoryFacets(keywordDirectoryFacetsInput.parse(input))
        );
        expect(withoutTimes(interactive)).toEqual(withoutTimes(background));
    });

    it('serves system status', async () => {
        const status = await onBothPools(() => caller.api.app.system.status());
        expect(status.interactive.products.total).toBeGreaterThan(0);
        expect(withoutTimes(status.interactive)).toEqual(withoutTimes(status.background));
    });

    it('serves Product search and a Product', async () => {
        const input = { sort: 'salesRankAsc' as const, recordInterest: false, pageSize: 20 };
        const search = await onBothPools(() => caller.api.app.product.search(input));
        expect(search.interactive.items.length).toBeGreaterThan(5);
        expect(withoutTimes(search.interactive)).toEqual(withoutTimes(search.background));

        const asin = mintSeedAsin(1);
        const product = await onBothPools(() =>
            caller.api.app.product.get({
                marketplaceId: SPAPI_US_MARKETPLACE_ID,
                asin,
            })
        );
        expect(product.interactive.product?.asin).toBe(asin);
        expect(withoutTimes(product.interactive)).toEqual(withoutTimes(product.background));
    });
});

const onBothPools = async <T>(work: () => Promise<T>) => ({
    interactive: await runInteractive(work),
    background: await runBackground(work),
});

/** Drops the clock readings and request timings two otherwise identical reads differ by. */
const withoutTimes = (value: unknown): unknown =>
    JSON.parse(
        JSON.stringify(value, (key, field) =>
            ['observedAt', 'checkedAt', 'latencyMs', 'durationMs', 'generatedAt'].includes(key)
                ? undefined
                : field
        )
    );

const adminContext = () =>
    ({
        user: { sub: 'mbu_interactive_test' },
        isAdmin: true,
        authType: 'access',
        credentialKind: 'session',
        authExpiresAtMs: null,
        accessPrincipal: {
            id: '11111111-1111-4111-8111-111111111111',
            service: 'rankwrangler',
            merchbaseUserId: 'mbu_interactive_test',
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
