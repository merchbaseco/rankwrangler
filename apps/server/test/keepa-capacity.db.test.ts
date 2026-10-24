import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { persistedKeepaCapacity as capacity } from '@/db/keepa-capacity';
import { keepaCapacityAttempts, keepaCapacityState } from '@/db/keepa-capacity-schema';
import { readKeepaCapacitySnapshot } from '@/db/keepa-capacity-snapshot';

const usage = { tokensConsumed: 10, tokensLeft: 1190, refillRate: 20, refillIn: 60_000 };
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'shared Keepa physical-attempt capacity',
    () => {
        beforeEach(async () => {
            if (
                process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
                process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
            ) {
                throw new Error('Capacity tests require private loopback database');
            }
            await db.execute(
                sql`truncate keepa_capacity_state, keepa_capacity_attempts, product_history_imports`
            );
            // Historical measurements are explicit test evidence, not synthesized provider usage.
            await db.insert(keepaCapacityAttempts).values([
                {
                    operation: 'product',
                    workClass: 'history',
                    actualTokens: 1,
                    reservedTokens: 1,
                    reservedAt: new Date(Date.now() - 86_400_001),
                    settledAt: new Date(),
                },
                {
                    operation: 'search',
                    workClass: 'head',
                    actualTokens: 10,
                    reservedTokens: 10,
                    reservedAt: new Date(Date.now() - 86_400_001),
                    settledAt: new Date(),
                },
            ]);
            await db.insert(keepaCapacityState).values({
                id: 1,
                tokensLeft: 40,
                refillRate: 20,
                refillInMs: 60_000,
                observedAt: new Date(),
            });
        });
        it('uses UTC even when the database host runs in another timezone', async () => {
            const [clock] = await db.execute<{ zone: string }>(
                sql`select current_setting('TimeZone') zone`
            );
            expect(clock.zone).toBe('UTC');
        });
        it('serializes competing reservations across callers without holding a network transaction', async () => {
            const ids = await Promise.all(
                [1, 2, 3].map(() => capacity.enqueue({ operation: 'search', workClass: 'head' }))
            );
            const outcomes = await Promise.allSettled(ids.map(id => capacity.reserve(id)));
            expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(2);
            expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
            const snapshot = await readKeepaCapacitySnapshot();
            expect(snapshot.interactiveFloor).toBe(20);
            expect(
                snapshot.rollingHour.find(row => row.workClass === 'head')?.reservedUnknownTokens
            ).toBe(20);
        });
        it('accounts errors and empty responses before any product ingestion', async () => {
            await db.update(keepaCapacityState).set({ tokensLeft: 1200 });
            const id = await capacity.enqueue({ operation: 'search', workClass: 'head' });
            await capacity.reserve(id);
            await capacity.settle(id, usage);
            const [attempt] = await db
                .select()
                .from(keepaCapacityAttempts)
                .where(eq(keepaCapacityAttempts.id, id));
            expect(attempt.actualTokens).toBe(10);
            expect(attempt.refillRate).toBe(20);
            expect(attempt.settledAt).toBeInstanceOf(Date);
            const [state] = await db.select().from(keepaCapacityState);
            expect(state.tokensLeft).toBe(1190);
        });
        it('retains unknown response spend until its accounting window expires', async () => {
            const id = await capacity.enqueue({ operation: 'search', workClass: 'head' });
            await capacity.reserve(id);
            await capacity.settle(id, null);
            expect((await readKeepaCapacitySnapshot()).rollingHour[0].reservedUnknownTokens).toBe(
                10
            );
            await db
                .update(keepaCapacityAttempts)
                .set({ reservedAt: new Date(Date.now() - 3_600_001) })
                .where(eq(keepaCapacityAttempts.id, id));
            const next = await capacity.enqueue({ operation: 'search', workClass: 'head' });
            await capacity.reserve(next);
            expect((await readKeepaCapacitySnapshot()).rollingHour[0].reservedUnknownTokens).toBe(
                10
            );
        });
        it('counts queued interactive interest durably and cancels without inventing attempts', async () => {
            const id = await capacity.enqueue({ operation: 'product', workClass: 'interactive' });
            expect((await readKeepaCapacitySnapshot()).interactiveWaiting).toBe(1);
            await capacity.cancel(id);
            const snapshot = await readKeepaCapacitySnapshot();
            expect(snapshot.interactiveWaiting).toBe(0);
            expect(snapshot.rollingHour).toEqual([]);
        });
        it('refuses stale observations and preserves the reason', async () => {
            await db.update(keepaCapacityState).set({ observedAt: new Date(Date.now() - 120_001) });
            const id = await capacity.enqueue({ operation: 'product', workClass: 'history' });
            await expect(capacity.reserve(id)).rejects.toMatchObject({ reason: 'stale-bucket' });
        });
        it('enforces global and per-keyword discovery pilot caps', async () => {
            const keywordId = crypto.randomUUID();
            await db.update(keepaCapacityState).set({ tokensLeft: 1200 });
            await db.insert(keepaCapacityAttempts).values(
                Array.from({ length: 10 }, () => ({
                    operation: 'search' as const,
                    workClass: 'discovery' as const,
                    keywordId,
                    actualTokens: 0,
                    reservedTokens: 10,
                    reservedAt: new Date(),
                    settledAt: new Date(),
                }))
            );
            const id = await capacity.enqueue({
                operation: 'search',
                workClass: 'discovery',
                keywordId,
            });
            await expect(capacity.reserve(id)).rejects.toMatchObject({
                reason: 'discovery-pilot-cap',
            });
        });
    }
);
