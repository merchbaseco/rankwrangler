import { beforeEach, describe, expect, it } from 'bun:test';
import { and, asc, eq, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { readProductStats, refreshProductStats } from '@/db/product-stats';
import { products } from '@/db/schema';
import {
    admitProductHistory,
    PRODUCT_STATS_MAX_AGE_MS,
} from '@/services/product-history-admission';

const market = 'ATVPDKIKX0DER';
const now = new Date('2026-10-23T12:00:00Z');
const ample = { refillRate: 1_000, productCost: 1 };

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')(
    'history admission on stored counts',
    () => {
        beforeEach(async () => {
            if (
                process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
                process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
            ) {
                throw new Error('Admission tests require the private loopback database.');
            }
            await db.execute(sql`truncate products, product_stats cascade`);
        });

        it('admits nothing before the first count or once the count is stale', async () => {
            await insert('B0ADMIT001');
            expect(await admitProductHistory(ample, now)).toMatchObject({
                admitted: 0,
                reason: 'counts_unknown',
            });
            await count(new Date(now.getTime() - PRODUCT_STATS_MAX_AGE_MS - 1));
            expect(await admitProductHistory(ample, now)).toMatchObject({
                admitted: 0,
                reason: 'counts_unknown',
            });
            const [row] = await db.select().from(products);
            expect(row.historyAdmissionState).toBe('notAdmitted');
        });

        it('adds its admissions to the stored population, which the next count confirms', async () => {
            await insert('B0ADMIT001', { rootCategoryBsr: 10_000 });
            await insert('B0ADMIT002', { rootCategoryBsr: 100_000 });
            await insert('B0ADMIT003', { rootCategoryBsr: 500_000 });
            await count(now);
            expect(await admitProductHistory(ample, now)).toMatchObject({ admitted: 3 });
            const after = await readProductStats();
            expect(after).toMatchObject({
                historyTwiceDaily: 1,
                historyDaily: 1,
                historyWeekly: 1,
            });

            // A later run plans with them: twice-daily 2 + daily 1 + weekly 1/7 tokens a day.
            await insert('B0ADMIT004', { rootCategoryBsr: 20_000 });
            const tight = { refillRate: (3 + 1 / 7 + 1.5) / (60 * 24 * 0.9), productCost: 1 };
            expect(await admitProductHistory(tight, now)).toMatchObject({ admitted: 0, paused: 1 });

            await count(now);
            expect(await readProductStats()).toMatchObject({
                historyTwiceDaily: 1,
                historyDaily: 1,
                historyWeekly: 1,
            });
        });

        it('picks the same candidates as the unindexed query, from the partial index', async () => {
            const rows: (typeof products.$inferInsert)[] = [];
            for (let index = 0; index < 320; index++) {
                const kind = index % 8;
                rows.push({
                    marketplaceId: market,
                    asin: `B0CAND${String(index).padStart(4, '0')}`,
                    isMerchListing: kind !== 1,
                    amazonListingStatus: kind === 2 ? 'deleted' : 'active',
                    rootCategoryBsr:
                        kind === 3 ? 1_200_000 : kind === 4 ? null : (index * 7919) % 900_000,
                    createdAt: new Date(now.getTime() - (index % 5) * 60_000),
                    ...(kind === 5
                        ? {
                              historyAdmissionState: 'admitted' as const,
                              historyAdmissionReason: 'legacy' as const,
                              historyAdmittedAt: now,
                          }
                        : kind === 6
                          ? {
                                historyAdmissionState: 'paused' as const,
                                historyAdmissionReason: 'capacity' as const,
                            }
                          : {}),
                });
            }
            // Ties on BSR fall back to creation time, then id.
            rows.push({
                marketplaceId: market,
                asin: 'B0CANDTIE1',
                isMerchListing: true,
                rootCategoryBsr: 7 * 7919,
            });
            await db.insert(products).values(rows);
            // The query admission ran before the partial index existed, kept as the reference.
            const reference = await db
                .select({ id: products.id })
                .from(products)
                .where(
                    and(
                        ne(products.historyAdmissionState, 'admitted'),
                        eq(products.amazonListingStatus, 'active'),
                        eq(products.isMerchListing, true),
                        lt(products.rootCategoryBsr, 1_000_000)
                    )
                )
                .orderBy(asc(products.rootCategoryBsr), asc(products.createdAt), asc(products.id))
                .limit(100);
            expect(reference).toHaveLength(100);

            const plan = await db.transaction(async tx => {
                await tx.execute(sql`set local enable_seqscan = off`);
                await tx.execute(sql`analyze products`);
                return tx.execute<{ 'QUERY PLAN': string }>(sql`explain select id from products
                where history_admission_state <> 'admitted' and amazon_listing_status = 'active'
                    and is_merch_listing and root_category_bsr < 1000000
                order by root_category_bsr, created_at, id limit 100`);
            });
            expect(plan.map(row => row['QUERY PLAN']).join('\n')).toContain(
                'products_history_admission_candidate_idx'
            );

            await count(now);
            expect((await admitProductHistory(ample, now)).admitted).toBe(reference.length);
            const admitted = await db
                .select({ id: products.id })
                .from(products)
                .where(
                    and(
                        eq(products.historyAdmissionState, 'admitted'),
                        eq(products.historyAdmissionReason, 'capacity')
                    )
                );
            expect(admitted.map(row => row.id).sort()).toEqual(reference.map(row => row.id).sort());
        });
    }
);

const count = (at: Date) => db.transaction(tx => refreshProductStats(tx, at));

const insert = (asin: string, overrides: Partial<typeof products.$inferInsert> = {}) =>
    db.insert(products).values({
        marketplaceId: market,
        asin,
        isMerchListing: true,
        rootCategoryBsr: 100_000,
        createdAt: new Date('2026-10-01T12:00:00Z'),
        ...overrides,
    });
