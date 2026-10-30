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
            parentAsin: null,
            title: null,
            brand: null,
            thumbnailUrl: null,
            isMerchListing: null,
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
        expect(result.historySeries).toEqual([
            {
                metric: 'bsr_main',
                categoryId: 12_345,
                keepaMinutes: [5_000_900, 5_001_000],
                values: [60_000, 54_321],
            },
            {
                metric: 'price_new',
                categoryId: -1,
                keepaMinutes: [5_000_900, 5_001_000],
                values: [2_099, 1_999],
            },
        ]);
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

    it('drops the no-category Long.MAX_VALUE sentinel instead of overflowing bigint', () => {
        const result = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt: new Date('2026-10-28T17:00:00.000Z'),
            product: {
                asin: 'B0C7QHJ4BT',
                rootCategory: 9_223_372_036_854_775_807,
                salesRankReference: 9_223_372_036_854_775_807,
            },
        });

        expect(result.product).toMatchObject({ rootCategoryId: null, keepaRootCategoryId: null });
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
                csv: [[], [5_001_000, 1_999], [], [5_001_000, 54_321]],
            },
        });

        expect(result.product).toMatchObject({
            rootCategoryBsr: 54_321,
            keepaCurrentBsr: 54_321,
            keepaCurrentNewPrice: 1_999,
        });
    });

    it('distinguishes unavailable features from an explicitly empty feature array', () => {
        const unavailable = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt: new Date('2026-07-22T14:00:00.000Z'),
            product: { asin: 'B0MERCH004' },
        });
        const availableEmpty = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt: new Date('2026-07-22T14:00:00.000Z'),
            product: { asin: 'B0MERCH005', features: [] },
        });

        expect(unavailable.product).toMatchObject({
            isMerchListing: null,
            bullet1: null,
            bullet2: null,
        });
        expect(availableEmpty.product).toMatchObject({
            isMerchListing: false,
            bullet1: null,
            bullet2: null,
        });
    });

    it('classifies a Merch part number even when no feature matches a template', () => {
        const merch = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt: new Date('2026-07-22T14:00:00.000Z'),
            product: {
                asin: 'B0MERCH006',
                title: 'Funny Cat Lover Graphic T-Shirt',
                partNumber: 'AFCHRPAT1KY',
                features: ['Seller bullet one', 'Seller bullet two'],
            },
        });
        const partNumberOnly = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt: new Date('2026-07-22T14:00:00.000Z'),
            product: { asin: 'B0MERCH007', partNumber: 'GIL1100MDWHTP6-01-White-M' },
        });

        expect(merch.product).toMatchObject({
            isMerchListing: true,
            bullet1: 'Seller bullet one',
            bullet2: 'Seller bullet two',
        });
        expect(partNumberOnly.product).toMatchObject({ isMerchListing: false });
    });

    it('classifies Keepa template features and extracts seller bullets before persistence', () => {
        const result = normalizeKeepaProduct({
            marketplaceId: 'ATVPDKIKX0DER',
            fetchedAt: new Date('2026-07-22T14:00:00.000Z'),
            product: {
                asin: 'B0MERCH006',
                features: [
                    'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                    'Seller-authored detail',
                ],
            },
        });

        expect(result.product).toMatchObject({
            isMerchListing: true,
            bullet1: 'Seller-authored detail',
            bullet2: null,
        });
    });
});
