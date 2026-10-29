import { beforeEach, describe, expect, it } from 'bun:test';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import { providerAttempts } from '@/db/provider-telemetry-schema';
import { readProductIndex, readProviderCalls } from '@/db/system-status';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces';
import { resetDiscoveryFixture } from './discovery-fixture';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('system status reads', () => {
    beforeEach(async () => {
        await resetDiscoveryFixture();
        await db.delete(providerAttempts);
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
        await insertProduct({ asin: 'B0STAT0005', bsr: 40_000, isMerchListing: false });

        const index = await readProductIndex(NOW);

        expect(index).toMatchObject({ total: 5, merch: 4 });
        // History counts wherever it came from; only listings without it split by tier.
        expect(index.history).toEqual({ withHistory: 2, awaitingFirst: 1, notTracked: 1 });
    });

    it('counts throttles apart from other provider errors', async () => {
        await insertAttempt({ statusCode: 200, isError: false });
        await insertAttempt({ statusCode: 429, isError: true });
        await insertAttempt({ statusCode: 429, isError: true });
        await insertAttempt({ statusCode: 500, isError: true });
        await insertAttempt({ statusCode: null, isError: true });

        const [calls] = await readProviderCalls(NOW);

        expect(calls).toEqual({
            provider: 'spapi',
            operation: 'spapi.catalog.search',
            calls1h: 5,
            calls24h: 5,
            throttled24h: 2,
            errors24h: 2,
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
        spApiFetchedAt: hoursBefore(6),
    });
};

const insertAttempt = async ({
    isError,
    statusCode,
}: {
    isError: boolean;
    statusCode: number | null;
}) => {
    await db.insert(providerAttempts).values({
        attemptedAt: new Date(NOW.getTime() - 10 * 60 * 1000),
        isError,
        latencyMs: 120,
        operation: 'spapi.catalog.search',
        provider: 'spapi',
        statusCode,
    });
};
