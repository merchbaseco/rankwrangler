import { describe, expect, it } from 'bun:test';
import { normalizeKeepaProduct } from '@/services/keepa-product-normalizer';

describe('normalizeKeepaProduct', () => {
    it('normalizes current Keepa metrics, source timestamps, and history together', () => {
        const fetchedAt = new Date('2026-07-22T14:00:00.000Z');

        const result = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt,
            product: {
                asin: 'B0MERCH001',
                trackingSince: 5_000_000,
                lastUpdate: 5_001_000,
                monthlySold: 200,
                salesRankReference: 12_345,
                stats: {
                    current: [-1, 1_999, -1, 54_321],
                    avg30: [-1, -1, -1, 65_000],
                    avg90: [-1, -1, -1, 70_000],
                    salesRankDrops30: 4,
                    salesRankDrops90: 11,
                    salesRankDrops180: 19,
                    salesRankDrops365: 31,
                },
                csv: [
                    [],
                    [5_000_900, 2_099, 5_001_000, 1_999],
                    [],
                    [5_000_900, 60_000, 5_001_000, 54_321],
                ],
            },
        });

        expect(result.product).toEqual({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B0MERCH001',
            title: null,
            brand: null,
            thumbnailUrl: null,
            bullet1: null,
            bullet2: null,
            dateFirstAvailable: null,
            rootCategoryId: 12_345,
            rootCategoryBsr: 54_321,
            keepaRootCategoryId: 12_345,
            keepaCurrentBsr: 54_321,
            keepaCurrentNewPrice: 1_999,
            keepaMonthlySold: 200,
            keepaBsrAverage30: 65_000,
            keepaBsrAverage90: 70_000,
            keepaSalesRankDrops30: 4,
            keepaSalesRankDrops90: 11,
            keepaSalesRankDrops180: 19,
            keepaSalesRankDrops365: 31,
            keepaFirstTrackedAt: new Date('2020-07-04T05:20:00.000Z'),
            keepaSourceUpdatedAt: new Date('2020-07-04T22:00:00.000Z'),
            keepaFetchedAt: fetchedAt,
        });
        expect(result.historyPoints).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ metric: 'bsr_main', valueInt: 54_321 }),
                expect.objectContaining({ metric: 'price_new', valueInt: 1_999 }),
            ])
        );
    });

    it('does not turn Keepa missing-value sentinels into product metrics', () => {
        const result = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt: new Date('2026-07-22T14:00:00.000Z'),
            product: {
                asin: 'B0MERCH002',
                trackingSince: 0,
                lastUpdate: 0,
                monthlySold: 0,
                salesRankReference: -1,
                stats: {
                    current: [-1, -1, -1, -1],
                    avg30: [-1, -1, -1, -1],
                    avg90: [-1, -1, -1, -1],
                    salesRankDrops30: -1,
                    salesRankDrops90: -1,
                    salesRankDrops180: -1,
                    salesRankDrops365: -1,
                },
            },
        });

        expect(result.product).toMatchObject({
            rootCategoryId: null,
            rootCategoryBsr: null,
            keepaRootCategoryId: null,
            keepaCurrentBsr: null,
            keepaCurrentNewPrice: null,
            keepaMonthlySold: null,
            keepaBsrAverage30: null,
            keepaBsrAverage90: null,
            keepaSalesRankDrops30: null,
            keepaSalesRankDrops90: null,
            keepaSalesRankDrops180: null,
            keepaSalesRankDrops365: null,
            keepaFirstTrackedAt: null,
            keepaSourceUpdatedAt: null,
        });
    });

    it('falls back to the latest history value when current stats are missing', () => {
        const result = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt: new Date('2026-07-22T14:00:00.000Z'),
            product: {
                asin: 'B0MERCH003',
                stats: {
                    current: [-1, -1, -1, -1],
                },
                csv: [
                    [],
                    [5_001_000, 1_999],
                    [],
                    [5_001_000, 54_321],
                ],
            },
        });

        expect(result.product).toMatchObject({
            rootCategoryBsr: 54_321,
            keepaCurrentBsr: 54_321,
            keepaCurrentNewPrice: 1_999,
        });
    });
});
