import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import { readProductIndex, readSystemPipelines } from '@/db/system-status';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { resetDiscoveryFixture } from './discovery-fixture';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('system status reads', () => {
    beforeEach(async () => {
        await resetDiscoveryFixture();
    });

    it('splits the catalog by sales-history coverage', async () => {
        await insertProduct({ asin: 'B0STAT0001', keepaFetchedAt: hoursBefore(1), bsr: 40_000 });
        await insertProduct({ asin: 'B0STAT0002', keepaFetchedAt: hoursBefore(48), bsr: 40_000 });
        await insertProduct({ asin: 'B0STAT0003', keepaFetchedAt: null, bsr: 500_000 });
        await insertProduct({ asin: 'B0STAT0004', keepaFetchedAt: null, bsr: 2_000_000 });
        await insertProduct({ asin: 'B0STAT0005', bsr: 40_000, isMerchListing: false });

        const index = await readProductIndex(NOW);

        expect(index).toMatchObject({ total: 5, merch: 4 });
        expect(index.history).toEqual({
            current: 1,
            overdue: 1,
            awaitingFirst: 1,
            notScheduled: 1,
        });
    });

    it('reports last run, next due and the overdue backlog per pipeline', async () => {
        // A sub-50k BSR refreshes history every 12 hours; the fresh one is next due in 11 hours.
        await insertProduct({ asin: 'B0STAT0011', keepaFetchedAt: hoursBefore(1), bsr: 40_000 });

        const fresh = await readSystemPipelines(NOW);
        const history = fresh.find(row => row.pipeline === 'keepa-history');
        expect(history).toMatchObject({
            lastRunAt: hoursBefore(1).toISOString(),
            nextDueAt: new Date(NOW.getTime() + 11 * HOUR_MS).toISOString(),
            overdue: 0,
        });

        await insertProduct({ asin: 'B0STAT0012', keepaFetchedAt: hoursBefore(72), bsr: 40_000 });
        const behind = await readSystemPipelines(NOW);
        expect(behind.find(row => row.pipeline === 'keepa-history')).toMatchObject({
            nextDueAt: NOW.toISOString(),
            overdue: 1,
        });
    });
});

const hoursBefore = (hours: number) => new Date(NOW.getTime() - hours * HOUR_MS);

const insertProduct = async ({
    asin,
    bsr,
    isMerchListing = true,
    keepaFetchedAt = null,
}: {
    asin: string;
    bsr: number;
    isMerchListing?: boolean;
    keepaFetchedAt?: Date | null;
}) => {
    const createdAt = new Date(NOW.getTime() - 30 * DAY_MS);
    await db.insert(products).values({
        amazonListingStatus: 'active',
        asin,
        createdAt,
        historyAdmissionReason: 'legacy',
        historyAdmissionState: 'admitted',
        historyAdmittedAt: createdAt,
        isMerchListing,
        keepaFetchedAt,
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        rootCategoryBsr: bsr,
        // Health waits out the SP-API write lag before judging history, so settle it first.
        spApiFetchedAt: hoursBefore(6),
    });
};
