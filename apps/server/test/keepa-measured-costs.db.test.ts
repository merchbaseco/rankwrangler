import { beforeEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { persistedKeepaCapacity as capacity } from '@/db/keepa-capacity';
import { readKeepaReservationFacts } from '@/db/keepa-capacity-facts';
import {
    keepaCapacityAttempts,
    keepaCapacityState,
    keepaMeasuredCosts,
} from '@/db/keepa-capacity-schema';
import { KEEPA_MEASURED_COST_WINDOW } from '@/db/keepa-measured-costs';
import { products } from '@/db/schema';
import { getKeepaAdmissionCapacity } from '@/services/keepa-capacity';
import { getKeepaReservation } from '@/services/providers/keepa/keepa-capacity-policy';

const usage = (tokensConsumed: number) => ({
    tokensConsumed,
    tokensLeft: 1100,
    refillRate: 20,
    refillIn: 60_000,
});
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('Keepa measured costs', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        ) {
            throw new Error('Measured-cost tests require the private loopback database');
        }
        await db.execute(
            sql`truncate keepa_capacity_state, keepa_capacity_attempts, keepa_measured_costs,
                product_history_imports, products cascade`
        );
        await db.insert(keepaCapacityState).values({
            id: 1,
            tokensLeft: 1200,
            refillRate: 20,
            refillInMs: 60_000,
            observedAt: new Date(),
        });
    });

    it('seeds the summary from history so the costs and every decision match the old scan', async () => {
        await seedHistory();
        const before = await readAllHistoryCosts();
        await db.execute(sql.raw(migrationSeedStatement()));

        expect(await readSummary()).toEqual(before);
        expect(before).toEqual({ productCost: 1, headCost: 10 });
        const facts = await readKeepaReservationFacts(db, { operation: 'search', keywordId: null });
        for (const workClass of ['interactive', 'history', 'head'] as const) {
            for (const tokensLeft of [0, 9, 10, 109, 110, 111, 1200]) {
                const decide = (costs: typeof before) =>
                    getKeepaReservation(
                        { operation: workClass === 'history' ? 'product' : 'search', workClass },
                        { ...facts, ...costs, tokensLeft, reserveTokens: 100 }
                    );
                expect(decide(await readSummary())).toEqual(decide(before));
            }
        }
        expect(await getKeepaAdmissionCapacity()).toEqual({
            refillRate: 20,
            productCost: 1,
            headCost: 10,
        });
    });

    it('measures each settled call per item and keeps only the recent window', async () => {
        for (const tokens of [100, 100, 300]) {
            const id = await capacity.enqueue({
                operation: 'product',
                workClass: 'interactive',
                itemCount: 100,
            });
            await capacity.reserve(id);
            await capacity.settle(id, usage(tokens));
        }
        const [product] = await db.select().from(keepaMeasuredCosts);
        expect(product).toMatchObject({ operation: 'product', recentCosts: [1, 1, 3], cost: 3 });

        await db
            .update(keepaMeasuredCosts)
            .set({ recentCosts: Array.from({ length: KEEPA_MEASURED_COST_WINDOW }, () => 5) });
        const id = await capacity.enqueue({ operation: 'product', workClass: 'interactive' });
        await capacity.reserve(id);
        await capacity.settle(id, usage(2));
        const [windowed] = await db.select().from(keepaMeasuredCosts);
        expect(windowed.recentCosts).toHaveLength(KEEPA_MEASURED_COST_WINDOW);
        expect(windowed.recentCosts.at(-1)).toBe(2);
        expect(windowed.cost).toBe(5);
    });

    it('ignores spend-free, unreported and unpriced calls', async () => {
        for (const [operation, tokens] of [
            ['search', 0],
            ['search', null],
            ['category', 5],
        ] as const) {
            const id = await capacity.enqueue({ operation, workClass: 'interactive' });
            await capacity.reserve(id);
            await capacity.settle(id, tokens === null ? null : usage(tokens));
        }
        expect(await db.select().from(keepaMeasuredCosts)).toEqual([]);
    });

    it('counts reservations inside the hour and day windows only', async () => {
        const keywordId = crypto.randomUUID();
        await db
            .insert(keepaCapacityAttempts)
            .values([
                attempt('head', { reservedAt: minutesAgo(30), reservedTokens: 10 }),
                attempt('head', { reservedAt: minutesAgo(61), reservedTokens: 10 }),
                attempt('head', { reservedAt: minutesAgo(1441), reservedTokens: 10 }),
                attempt('head', {
                    reservedAt: minutesAgo(5),
                    reservedTokens: 10,
                    actualTokens: 10,
                }),
                attempt('discovery', { reservedAt: minutesAgo(90), keywordId }),
                attempt('discovery', { reservedAt: minutesAgo(1439) }),
                attempt('discovery', { reservedAt: minutesAgo(1500), keywordId }),
                attempt('interactive', { reservedAt: minutesAgo(10), operation: 'product' }),
                attempt('interactive', { reservedAt: minutesAgo(10) }),
                attempt('interactive', {
                    reservedAt: null,
                    settledAt: null,
                    createdAt: minutesAgo(4),
                }),
            ]);

        const facts = await readKeepaReservationFacts(db, { operation: 'search', keywordId });

        expect(facts).toMatchObject({
            // Only the unsettled head reserved half an hour ago is still open spend.
            reservedCost: 10,
            headRequests: 3,
            discoveryRequests: 2,
            keywordDiscoveryRequests: 1,
            interactiveOperationAttempts: 1,
            interactiveWaiting: true,
        });
        // The reference: the old statement over the same rows.
        const [old] = await db.execute<Record<string, number>>(sql`
            select
                coalesce(sum(reserved_tokens) filter (where reserved_at > timezone('UTC',now())-interval '60 minutes' and actual_tokens is null),0)::float8 reserved,
                count(*) filter (where work_class='head')::integer heads,
                count(*) filter (where work_class='discovery')::integer discoveries,
                count(*) filter (where work_class='discovery' and keyword_id=${keywordId})::integer keyword_discoveries,
                count(*) filter (where operation='search' and work_class='interactive')::integer interactive
            from keepa_capacity_attempts where reserved_at > timezone('UTC',now())-interval '24 hours'`);
        expect([
            facts.reservedCost,
            facts.headRequests,
            facts.discoveryRequests,
            facts.keywordDiscoveryRequests,
            facts.interactiveOperationAttempts,
        ]).toEqual([
            old.reserved,
            old.heads,
            old.discoveries,
            old.keyword_discoveries,
            old.interactive,
        ]);
    });
});

const attempt = (
    workClass: 'head' | 'discovery' | 'interactive',
    overrides: Partial<typeof keepaCapacityAttempts.$inferInsert>
): typeof keepaCapacityAttempts.$inferInsert => ({
    operation: 'search',
    workClass,
    reservedTokens: 0,
    actualTokens: null,
    settledAt: new Date(),
    createdAt: overrides.reservedAt ?? new Date(),
    ...overrides,
});

// Production-shaped history: per-product import shares of 1 and catalog searches of 10 alongside
// settled attempts, product batches spending one token per item.
const seedHistory = async () => {
    const [product] = await db
        .insert(products)
        .values({ marketplaceId: 'ATVPDKIKX0DER', asin: 'B0COST0001' })
        .returning({ id: products.id });
    await db.execute(sql`insert into product_history_imports
        (product_id, marketplace_id, asin, source, status, request_params, tokens_consumed)
        select ${product.id}, 'ATVPDKIKX0DER', 'B0COST0001', 'keepa', 'success',
            jsonb_build_object('kind', kind), cost
        from (values ('product', 1), ('catalogSearch', 10), ('product', 0)) v(kind, cost),
            generate_series(1, 40)`);
    await db.insert(keepaCapacityAttempts).values(
        Array.from({ length: 30 }, (_, index) => ({
            operation: index % 3 === 0 ? ('search' as const) : ('product' as const),
            workClass: index % 3 === 0 ? ('head' as const) : ('history' as const),
            itemCount: index % 3 === 0 ? 1 : 100,
            actualTokens: index % 3 === 0 ? 10 : 100,
            reservedTokens: 10,
            reservedAt: minutesAgo(3000 - index),
            settledAt: minutesAgo(3000 - index),
        }))
    );
};

// The computation this summary replaces, kept as the reference: p95 over all of history.
const readAllHistoryCosts = async () => {
    const rows = await db.execute<{ operation: string; cost: number }>(sql`
        with measurements as (
            select case when request_params->>'kind' = 'catalogSearch' then 'search' else 'product' end as operation,
                tokens_consumed as cost
            from product_history_imports where source = 'keepa' and tokens_consumed > 0
            union all
            select operation, ceil(actual_tokens::numeric / item_count)::integer as cost
            from keepa_capacity_attempts
            where actual_tokens > 0 and operation in ('product', 'search')
        ) select operation, percentile_disc(0.95) within group (order by cost)::integer as cost
        from measurements group by operation
    `);
    return {
        productCost: rows.find(row => row.operation === 'product')?.cost ?? null,
        headCost: rows.find(row => row.operation === 'search')?.cost ?? null,
    };
};

const readSummary = async () => {
    const rows = await db.select().from(keepaMeasuredCosts);
    return {
        productCost: rows.find(row => row.operation === 'product')?.cost ?? null,
        headCost: rows.find(row => row.operation === 'search')?.cost ?? null,
    };
};

const migrationSeedStatement = () => {
    const migration = readFileSync(
        join(import.meta.dir, '../drizzle/0072_product_stats_and_keepa_costs.sql'),
        'utf8'
    );
    const statement = migration
        .split('--> statement-breakpoint')
        .map(part => part.trim())
        .find(part => part.startsWith('INSERT INTO "keepa_measured_costs"'));
    if (!statement) {
        throw new Error('Migration 0072 lost its measured-cost seed');
    }
    return statement;
};
