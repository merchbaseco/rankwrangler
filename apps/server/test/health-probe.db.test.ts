import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    catalogQueries,
    catalogSearchResults,
    catalogSearchRuns,
    operations,
    products,
    spApiSyncQueue,
} from '@/db/schema';
import { topSearchTermsDatasets } from '@/db/top-search-terms-schema';
import { type FreshnessCheckName, readHealthProbe } from '@/health/health-probe';

const NOW = new Date('2026-10-08T20:00:00.000Z');
const ACTIVE_UNTIL = new Date('2026-11-01T00:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('Health probe reads', () => {
    beforeEach(async () => {
        await db.delete(spApiSyncQueue);
        await db.delete(catalogSearchResults);
        await db.delete(catalogSearchRuns);
        await db.delete(operations);
        await db.delete(catalogQueries);
        await db.delete(products);
        await db.delete(topSearchTermsDatasets);
    });

    it('reads idle pipelines as nothing due and skips freshness when the runner is off', async () => {
        expect(await readHealthProbe({ now: NOW, jobRunner: 'enabled' })).toEqual({
            database: 'reachable',
            freshness: {
                'product-details': 'nothing-due',
                'product-history': 'nothing-due',
                'top-search-terms': new Date('2026-10-06T06:59:59.999Z'),
                'catalog-keywords': 'nothing-due',
            },
        });
        expect(await readHealthProbe({ now: NOW, jobRunner: 'disabled' })).toEqual({
            database: 'reachable',
            freshness: {},
        });
    });

    it('dates product-details by the SP-API tier of each eligible listing', async () => {
        await insertProducts([
            { rootCategoryBsr: 150_000, spApiFetchedAt: new Date('2026-10-07T12:00:00.000Z') },
            { rootCategoryBsr: 3_500_000, spApiFetchedAt: new Date('2026-09-01T00:00:00.123Z') },
            { rootCategoryBsr: 100, spApiFetchedAt: old, amazonListingStatus: 'deleted' },
            { rootCategoryBsr: 100, spApiFetchedAt: old, isMerchListing: false },
            { rootCategoryBsr: null, spApiFetchedAt: old },
        ]);

        expect(await readFreshness('product-details')).toEqual(
            new Date('2026-10-01T00:00:00.123Z')
        );
    });

    it('dates product-history at the 26th due listing, using creation for unfetched ones', async () => {
        await insertProducts([
            ...Array.from({ length: 25 }, (_, index) => ({
                rootCategoryBsr: 1000 + index,
                keepaFetchedAt: new Date(
                    Date.parse('2026-09-01T00:00:00.000Z') + index * MINUTE_MS
                ),
            })),
            { rootCategoryBsr: 500_000, keepaFetchedAt: new Date('2026-08-30T00:00:00.000Z') },
            { rootCategoryBsr: 1000, createdAt: new Date('2026-09-04T00:00:00.000Z') },
            { rootCategoryBsr: 2_000_000, createdAt: old },
            { rootCategoryBsr: 1000, createdAt: old, isMerchListing: false },
        ]);

        expect(await readFreshness('product-history')).toEqual(
            new Date('2026-09-04T00:00:00.000Z')
        );
    });

    it('dates catalog-keywords at the 4th due active query', async () => {
        await insertQueries([
            ...Array.from({ length: 3 }, (_, index) => ({
                latestSuccessfulRunAt: new Date(
                    Date.parse('2026-09-01T00:00:00.000Z') + index * HOUR_MS
                ),
            })),
            { createdAt: new Date('2026-09-09T00:00:00.000Z') },
            { latestSuccessfulRunAt: new Date('2026-09-05T00:00:00.000Z') },
            { latestSuccessfulRunAt: old, activeUntil: new Date('2026-10-01T00:00:00.000Z') },
        ]);

        expect(await readFreshness('catalog-keywords')).toEqual(
            new Date('2026-09-09T00:00:00.000Z')
        );
    });

    it('dates top-search-terms by the window after the newest final one', async () => {
        const completedAt = new Date('2026-10-07T00:00:00.000Z');
        await db.insert(topSearchTermsDatasets).values([
            dataset('DAY', '2026-10-03', '2026-10-03', { lastCompletedAt: completedAt }),
            dataset('DAY', '2026-10-06', '2026-10-06', {
                lastCompletedAt: completedAt,
                nextRefreshAt: new Date('2026-10-10T06:59:59.999Z'),
            }),
            dataset('WEEK', '2026-09-27', '2026-10-03', { lastCompletedAt: completedAt }),
            dataset('DAY', '2026-10-07', '2026-10-07', {
                lastCompletedAt: completedAt,
                marketplaceId: 'A1F83G8C2ARO7P',
            }),
        ]);

        expect(await readFreshness('top-search-terms')).toEqual(
            new Date('2026-10-08T06:59:59.999Z')
        );
    });

    it('leaves out a read cancelled by the statement timeout and keeps the others', async () => {
        let markLocked: () => void = () => undefined;
        let releaseLock: () => void = () => undefined;
        const locked = new Promise<void>(resolve => {
            markLocked = resolve;
        });
        const released = new Promise<void>(resolve => {
            releaseLock = resolve;
        });
        const lockHolder = db.transaction(async tx => {
            await tx.execute(sql`lock table catalog_queries in access exclusive mode`);
            markLocked();
            await released;
        });
        await locked;

        const probe = await readHealthProbe({ now: NOW, jobRunner: 'enabled' });
        releaseLock();
        await lockHolder;

        expect(probe).toEqual({
            database: 'reachable',
            freshness: {
                'product-details': 'nothing-due',
                'product-history': 'nothing-due',
                'top-search-terms': new Date('2026-10-06T06:59:59.999Z'),
            },
        });
    });
});

const old = new Date('2020-01-01T00:00:00.000Z');
let asinSequence = 0;

const readFreshness = async (name: FreshnessCheckName) => {
    const probe = await readHealthProbe({ now: NOW, jobRunner: 'enabled' });
    return probe.database === 'reachable' ? probe.freshness[name] : probe.database;
};

const insertProducts = (rows: readonly Partial<typeof products.$inferInsert>[]) =>
    db.insert(products).values(
        rows.map(row => ({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: `B0HP${String(++asinSequence).padStart(6, '0')}`,
            isMerchListing: true,
            ...row,
        }))
    );

const insertQueries = (rows: readonly Partial<typeof catalogQueries.$inferInsert>[]) =>
    db.insert(catalogQueries).values(
        rows.map((row, index) => ({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: `health term ${index}`,
            displayTerm: `Health Term ${index}`,
            page: 0,
            activeUntil: ACTIVE_UNTIL,
            ...row,
        }))
    );

const dataset = (
    reportPeriod: 'DAY' | 'WEEK',
    dataStartDate: string,
    dataEndDate: string,
    row: Partial<typeof topSearchTermsDatasets.$inferInsert>
) => ({
    marketplaceId: 'ATVPDKIKX0DER',
    reportPeriod,
    dataStartDate,
    dataEndDate,
    ...row,
});
