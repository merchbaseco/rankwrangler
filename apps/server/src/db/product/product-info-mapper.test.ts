import { describe, expect, it } from 'bun:test';
import { mapStoredProductInfo } from '@/db/product/product-info-mapper';

describe('mapStoredProductInfo', () => {
    it('exposes SP-API and Keepa freshness independently', () => {
        const result = mapStoredProductInfo(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B0MERCH001',
                dateFirstAvailable: new Date('2024-01-01T00:00:00.000Z'),
                thumbnailUrl: 'https://example.com/product.jpg',
                title: 'Example shirt',
                brand: 'Example brand',
                isMerchListing: true,
                amazonListingStatus: 'active',
                bullet1: 'First bullet',
                bullet2: 'Second bullet',
                rootCategoryId: 12_345,
                rootCategoryBsr: 54_321,
                spApiFetchedAt: new Date('2026-07-22T13:00:00.000Z'),
                spApiResolvedAt: new Date('2026-07-22T13:00:00.000Z'),
                keepaFetchedAt: new Date('2026-07-22T14:00:00.000Z'),
                keepaSourceUpdatedAt: new Date('2026-07-22T12:00:00.000Z'),
                keepaFirstTrackedAt: new Date('2020-07-04T05:20:00.000Z'),
                keepaRootCategoryId: 12_345,
                keepaCurrentBsr: 54_321,
                keepaCurrentNewPrice: 1999,
                keepaMonthlySold: 200,
                keepaBsrAverage30: 65_000,
                keepaBsrAverage90: 70_000,
                keepaSalesRankDrops30: 4,
                keepaSalesRankDrops90: 11,
                keepaSalesRankDrops180: 19,
                keepaSalesRankDrops365: 31,
                createdAt: new Date('2026-07-01T00:00:00.000Z'),
            },
            { thumbnailPending: false }
        );

        expect(result.freshness).toEqual({
            stale: true,
            updatedAt: '2026-07-22T13:00:00.000Z',
        });
        expect(result.thumbnail).toEqual({
            status: 'available',
            url: 'https://example.com/product.jpg',
        });
        expect(result.keepa).toEqual({
            fetchedAt: '2026-07-22T14:00:00.000Z',
            sourceUpdatedAt: '2026-07-22T12:00:00.000Z',
            firstTrackedAt: '2020-07-04T05:20:00.000Z',
            rootCategoryId: 12_345,
            currentRootCategoryBsr: 54_321,
            currentNewPrice: {
                amountMinor: 1999,
                currencyCode: 'USD',
            },
            monthlySold: 200,
            averageRootCategoryBsr30: 65_000,
            averageRootCategoryBsr90: 70_000,
            salesRankDrops: {
                days30: 4,
                days90: 11,
                days180: 19,
                days365: 31,
            },
        });
    });

    it('exposes accepted Keepa state without SP-API freshness or invented metrics', () => {
        const result = mapStoredProductInfo(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B0KEEPAONLY',
                dateFirstAvailable: null,
                thumbnailUrl: null,
                title: null,
                brand: null,
                isMerchListing: null,
                amazonListingStatus: 'deleted',
                bullet1: null,
                bullet2: null,
                rootCategoryId: null,
                rootCategoryBsr: null,
                spApiFetchedAt: null,
                spApiResolvedAt: new Date('2026-07-22T15:00:00.000Z'),
                keepaFetchedAt: new Date('2026-07-22T14:00:00.000Z'),
                keepaSourceUpdatedAt: null,
                keepaFirstTrackedAt: null,
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
                createdAt: new Date('2026-07-01T00:00:00.000Z'),
            },
            { thumbnailPending: false }
        );

        expect(result.freshness).toEqual({ stale: true, updatedAt: null });
        expect(result.amazonListingStatus).toBe('deleted');
        expect(result.thumbnail).toEqual({ status: 'unavailable' });
        expect(result.keepa).toEqual({
            fetchedAt: '2026-07-22T14:00:00.000Z',
            sourceUpdatedAt: null,
            firstTrackedAt: null,
            rootCategoryId: null,
            currentRootCategoryBsr: null,
            currentNewPrice: null,
            monthlySold: null,
            averageRootCategoryBsr30: null,
            averageRootCategoryBsr90: null,
            salesRankDrops: {
                days30: null,
                days90: null,
                days180: null,
                days365: null,
            },
        });
    });
});
