import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { refreshProductStats } from '@/db/product-stats';
import { products } from '@/db/schema';
import { providerAttempts } from '@/db/provider-telemetry-schema';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { getSystemStatus } from '@/services/system-status';
import { resetDiscoveryFixture } from './discovery-fixture';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('system status reads', () => {
    beforeEach(async () => {
        await resetDiscoveryFixture();
        await db.delete(providerAttempts);
    });

    it('reports nothing counted before the first snapshot', async () => {
        await insertProduct({ asin: 'B0STAT0001', bsr: 40_000 });

        const status = await getSystemStatus(NOW);

        expect(status).toMatchObject({ countedAt: null, products: null, calls: [] });
    });

    it('splits the Merch catalog by sales-history sync status', async () => {
        await insertProduct({ asin: 'B0STAT0001', keepaFetchedAt: hoursBefore(1), bsr: 40_000 });
        await insertProduct({
            asin: 'B0STAT0002',
            bsr: 2_000_000,
            keepaFetchedAt: hoursBefore(48),
        });
        await insertProduct({ asin: 'B0STAT0003', keepaFetchedAt: null, bsr: 500_000 });
        await insertProduct({ asin: 'B0STAT0004', keepaFetchedAt: null, bsr: 2_000_000 });
        await insertProduct({ asin: 'B0STAT0008', keepaFetchedAt: null, bsr: null, admitted: false });
        await insertProduct({ asin: 'B0STAT0009', keepaFetchedAt: null, bsr: 200_000, admitted: false });
        await insertProduct({ asin: 'B0STAT0005', bsr: 40_000, isMerchListing: false });
        await insertProduct({ asin: 'B0STAT0006', bsr: 40_000, createdAt: hoursBefore(2) });
        await insertProduct({
            asin: 'B0STAT0007',
            bsr: 90_000,
            admitted: false,
            amazonListingStatus: 'deleted',
        });
        await count();

        const status = await getSystemStatus(NOW);

        expect(status.countedAt).toBe(NOW.toISOString());
        expect(status.products).toEqual({
            total: 9,
            merch: 7,
            new24h: 1,
            breakdown: { autoTracked: 4, onDemand: 2, noBsr: 1 },
            // Active Merch partitions cleanly across all four buckets, including NULL-BSR rows.
            history: {
                withHistory: 2,
                autoSynced: 1,
                awaitingFirst: 2,
                awaitingAdmission: 1,
                notTracked: 2,
            },
        });
        expect(status.products).toEqual(await readProductIndexDirectly());
        expect(status.keepa.admission).toEqual({
            state: 'capacity',
            waiting: 1,
            overdue: 2,
            oldestOverdueAt: expect.any(String),
        });
    });

    it('counts throttles apart from other provider errors', async () => {
        await insertAttempt({ statusCode: 200, isError: false });
        await insertAttempt({ statusCode: 429, isError: true });
        await insertAttempt({ statusCode: 429, isError: true });
        await insertAttempt({ statusCode: 500, isError: true });
        await insertAttempt({ statusCode: null, isError: true });
        await insertAttempt({ statusCode: 200, isError: false, at: hoursBefore(3) });
        await insertAttempt({ statusCode: 200, isError: false, at: hoursBefore(25) });
        await insertAttempt({ statusCode: 200, isError: false, operation: 'spapi.token' });
        await count();

        const { calls } = await getSystemStatus(NOW);

        expect(calls).toEqual([
            {
                provider: 'spapi',
                operation: 'spapi.catalog.search',
                calls1h: 5,
                calls24h: 6,
                throttled24h: 2,
                errors24h: 2,
            },
        ]);
    });
});

const count = () => db.transaction(tx => refreshProductStats(tx, NOW));

const hoursBefore = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS);

// The live count the snapshot replaced, kept as the reference.
const readProductIndexDirectly = async () => {
    const merch = sql`is_merch_listing and amazon_listing_status='active'`;
    const tracked = sql`${merch} and history_admission_state='admitted'
        and root_category_bsr is not null and root_category_bsr < 1000000`;
    const waiting = sql`${merch} and history_admission_state<>'admitted'
        and root_category_bsr is not null and root_category_bsr < 1000000`;
    const [row] = await db.execute<Record<string, number>>(sql`
        select count(*)::int total,
            count(*) filter (where ${merch})::int merch,
            count(*) filter (where created_at > ${NOW.toISOString()}::timestamp - interval '24 hours')::int new_24h,
            count(*) filter (where ${tracked} or ${waiting})::int auto_tracked,
            count(*) filter (where ${merch} and root_category_bsr >= 1000000)::int on_demand,
            count(*) filter (where ${merch} and root_category_bsr is null)::int no_bsr,
            count(*) filter (where ${merch} and keepa_fetched_at is not null and not (${waiting}))::int with_history,
            count(*) filter (where ${tracked} and keepa_fetched_at is not null)::int auto_synced,
            count(*) filter (where ${tracked} and keepa_fetched_at is null)::int awaiting_first,
            count(*) filter (where ${waiting})::int awaiting_admission,
            count(*) filter (where ${merch} and keepa_fetched_at is null and not (${tracked}) and not (${waiting}))::int not_tracked
        from products`);
    return {
        total: row.total,
        merch: row.merch,
        new24h: row.new_24h,
        breakdown: {
            autoTracked: row.auto_tracked,
            onDemand: row.on_demand,
            noBsr: row.no_bsr,
        },
        history: {
            withHistory: row.with_history,
            autoSynced: row.auto_synced,
            awaitingFirst: row.awaiting_first,
            awaitingAdmission: row.awaiting_admission,
            notTracked: row.not_tracked,
        },
    };
};

const insertProduct = async ({
    asin,
    bsr,
    isMerchListing = true,
    keepaFetchedAt = null,
    createdAt = new Date(NOW.getTime() - 30 * DAY_MS),
    admitted = true,
    amazonListingStatus = 'active',
}: {
    asin: string;
    bsr: number | null;
    isMerchListing?: boolean;
    keepaFetchedAt?: Date | null;
    createdAt?: Date;
    admitted?: boolean;
    amazonListingStatus?: 'active' | 'deleted';
}) => {
    await db.insert(products).values({
        amazonListingStatus,
        asin,
        createdAt,
        ...(admitted
            ? {
                  historyAdmissionReason: 'legacy' as const,
                  historyAdmissionState: 'admitted' as const,
                  historyAdmittedAt: createdAt,
              }
            : {}),
        isMerchListing,
        keepaFetchedAt,
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        rootCategoryBsr: bsr,
        spApiFetchedAt: hoursBefore(6),
    });
};

const insertAttempt = async ({
    isError,
    statusCode,
    at = new Date(NOW.getTime() - 10 * 60 * 1000),
    operation = 'spapi.catalog.search',
}: {
    isError: boolean;
    statusCode: number | null;
    at?: Date;
    operation?: string;
}) => {
    await db.insert(providerAttempts).values({
        attemptedAt: at,
        isError,
        latencyMs: 120,
        operation,
        provider: 'spapi',
        statusCode,
    });
};
