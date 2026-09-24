import { describe, expect, it, mock } from 'bun:test';
import type { ProductInfo } from '@/types';
import {
    getProductReadModel,
    mapProductToCompactProductSearch,
    mapProductToPublicProduct,
    type ProductReadModelDeps,
} from './product-read-model';

describe('public Product read model', () => {
    it('waits through the shared Product and history retrieval paths before reading current data', async () => {
        const product = createProductInfo();
        const signal = new AbortController().signal;
        const getRequiredProduct = mock(async () => product);
        const getProductHistorySurface = mock(async () => ({}) as never);
        const getProductShortName = mock(async () => 'Garden Shirt');
        const getProductCutoutThumbnail = mock(async () => null);

        const result = await getProductReadModel(
            {
                marketplaceId: product.marketplaceId,
                asin: ` ${product.asin.toLowerCase()} `,
                ownerMerchbaseUserId: 'mbu_test',
                signal,
            },
            {
                getRequiredProduct,
                getProductHistorySurface,
                getProductShortName,
                getProductCutoutThumbnail,
            } satisfies ProductReadModelDeps
        );

        expect(result).toEqual(mapProductToPublicProduct(product));
        expect(getRequiredProduct.mock.calls).toHaveLength(2);
        expect(getRequiredProduct.mock.calls[0]?.[0]).toMatchObject({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            signal,
        });
        expect(getRequiredProduct.mock.calls[1]?.[0]).toMatchObject({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            signal,
        });
        expect(getProductHistorySurface.mock.calls[0]?.[0]).toMatchObject({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            metrics: ['bsr', 'price'],
            format: 'agent',
            refresh: true,
            ownerMerchbaseUserId: 'mbu_test',
            signal,
        });
        expect(getProductShortName).not.toHaveBeenCalled();
        expect(getProductCutoutThumbnail).not.toHaveBeenCalled();
    });

    it('generates a short name only for an opted-in Merch Product with an image', async () => {
        const product = {
            ...createProductInfo(),
            isMerchListing: true,
            thumbnail: { status: 'available' as const, url: 'https://m.media-amazon.com/test.jpg' },
        };
        const getProductShortName = mock(async () => 'Garden Shirt');

        const result = await getProductReadModel(
            {
                marketplaceId: product.marketplaceId,
                asin: product.asin,
                ownerMerchbaseUserId: 'mbu_test',
                include: ['marketData', 'shortName'],
            },
            {
                getRequiredProduct: mock(async () => product),
                getProductHistorySurface: mock(async () => ({}) as never),
                getProductShortName,
                getProductCutoutThumbnail: mock(async () => null),
            }
        );

        expect(result.listing.shortName).toBe('Garden Shirt');
        expect(getProductShortName).toHaveBeenCalledWith({
            marketplaceId: product.marketplaceId,
            asin: product.asin,
            title: product.title,
            thumbnail: product.thumbnail,
            signal: undefined,
        });
    });

    it('hydrates a cutout independently of Merch classification and market data', async () => {
        const product = {
            ...createProductInfo(),
            thumbnail: { status: 'available' as const, url: 'https://m.media-amazon.com/a.jpg' },
        };
        const getProductHistorySurface = mock(async () => ({}) as never);
        const getProductShortName = mock(async () => null);
        const getProductCutoutThumbnail = mock(
            async () => 'https://images.rankwrangler.merchbase.co/a.webp'
        );

        const result = await getProductReadModel(
            {
                marketplaceId: product.marketplaceId,
                asin: product.asin,
                ownerMerchbaseUserId: 'mbu_test',
                include: ['cutoutThumbnail'],
            },
            {
                getRequiredProduct: mock(async () => product),
                getProductHistorySurface,
                getProductShortName,
                getProductCutoutThumbnail,
            }
        );

        expect(result.listing.cutoutThumbnail).toEqual({
            status: 'available',
            url: 'https://images.rankwrangler.merchbase.co/a.webp',
        });
        expect(getProductCutoutThumbnail).toHaveBeenCalledTimes(1);
        expect(getProductHistorySurface).not.toHaveBeenCalled();
        expect(getProductShortName).not.toHaveBeenCalled();
    });

    it('regenerates a cutout when the source image changes during hydration', async () => {
        const initial = {
            ...createProductInfo(),
            thumbnail: { status: 'available' as const, url: 'https://m.media-amazon.com/a.jpg' },
        };
        const current = {
            ...initial,
            thumbnail: { status: 'available' as const, url: 'https://m.media-amazon.com/b.jpg' },
        };
        const getProductCutoutThumbnail = mock()
            .mockResolvedValueOnce('https://images.rankwrangler.merchbase.co/a.webp')
            .mockResolvedValueOnce('https://images.rankwrangler.merchbase.co/b.webp');

        const result = await getProductReadModel(
            {
                marketplaceId: initial.marketplaceId,
                asin: initial.asin,
                ownerMerchbaseUserId: 'mbu_test',
                include: ['cutoutThumbnail'],
            },
            {
                getRequiredProduct: mock()
                    .mockResolvedValueOnce(initial)
                    .mockResolvedValueOnce(current),
                getProductHistorySurface: mock(async () => ({}) as never),
                getProductShortName: mock(async () => null),
                getProductCutoutThumbnail,
            }
        );

        expect(result.listing.cutoutThumbnail).toEqual({
            status: 'available',
            url: 'https://images.rankwrangler.merchbase.co/b.webp',
        });
        expect(getProductCutoutThumbnail.mock.calls).toHaveLength(2);
        expect(getProductCutoutThumbnail.mock.calls[1]?.[0].thumbnail).toEqual(current.thumbnail);
    });

    it('regenerates against the latest title when market data updates the Product', async () => {
        const initial = {
            ...createProductInfo(),
            isMerchListing: true,
            thumbnail: { status: 'available' as const, url: 'https://m.media-amazon.com/a.jpg' },
        };
        const current = { ...initial, title: '100 Days Smarter Shirt' };
        const getRequiredProduct = mock()
            .mockResolvedValueOnce(initial)
            .mockResolvedValueOnce(current);
        const getProductShortName = mock()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('100 Days Smarter');

        const result = await getProductReadModel(
            {
                marketplaceId: initial.marketplaceId,
                asin: initial.asin,
                ownerMerchbaseUserId: 'mbu_test',
                include: ['marketData', 'shortName'],
            },
            {
                getRequiredProduct,
                getProductHistorySurface: mock(async () => ({}) as never),
                getProductShortName,
                getProductCutoutThumbnail: mock(async () => null),
            }
        );

        expect(result.listing.title).toBe(current.title);
        expect(result.listing.shortName).toBe('100 Days Smarter');
        expect(getProductShortName.mock.calls).toHaveLength(2);
        expect(getProductShortName.mock.calls[1]?.[0].title).toBe(current.title);
    });

    it('skips Keepa history when market data is not requested', async () => {
        const product = createProductInfo();
        const getProductHistorySurface = mock(async () => ({}) as never);
        const result = await getProductReadModel(
            {
                marketplaceId: product.marketplaceId,
                asin: product.asin,
                ownerMerchbaseUserId: 'mbu_test',
                include: [],
            },
            {
                getRequiredProduct: mock(async () => product),
                getProductHistorySurface,
                getProductShortName: mock(async () => null),
                getProductCutoutThumbnail: mock(async () => null),
            }
        );

        expect(getProductHistorySurface).not.toHaveBeenCalled();
        expect(result.salesRank.current).toBeNull();
        expect(result.price).toBeNull();
        expect(result.demand.boughtInPastMonth).toBeNull();
    });

    it('projects current source observations into the provider-neutral Product shape', () => {
        const result = mapProductToPublicProduct(createProductInfo());

        expect(result).toEqual({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            listing: {
                title: 'Garden shirt',
                shortName: null,
                cutoutThumbnail: null,
                brand: 'Example brand',
                firstAvailableAt: '2026-01-01T00:00:00.000Z',
                bulletPoints: ['Made for gardeners'],
                thumbnail: { status: 'unavailable' },
                isMerchListing: null,
                amazonListingStatus: 'active',
            },
            category: { id: 12_345, name: 'Clothing' },
            salesRank: {
                current: 12_345,
                averages: { last30Days: 15_000, last90Days: 18_000 },
            },
            price: { amountMinor: 1999, currencyCode: 'USD' },
            demand: {
                boughtInPastMonth: 200,
                salesRankDrops: {
                    last30Days: 4,
                    last90Days: 11,
                    last180Days: 19,
                    last365Days: 31,
                },
            },
        });
    });

    it('keeps valid unavailable measurements null and empty bullets as an empty array', () => {
        const result = mapProductToPublicProduct({
            asin: 'B012345678',
            marketplaceId: 'ATVPDKIKX0DER',
            dateFirstAvailable: null,
            title: null,
            brand: null,
            isMerchListing: false,
            amazonListingStatus: 'deleted',
            bullet1: null,
            bullet2: null,
            rootCategoryId: null,
            rootCategoryBsr: null,
            rootCategoryDisplayName: null,
            thumbnail: { status: 'unavailable' },
            keepa: null,
            freshness: { stale: true, updatedAt: null },
        } satisfies ProductInfo);

        expect(result).toEqual({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            listing: {
                title: null,
                shortName: null,
                cutoutThumbnail: null,
                brand: null,
                firstAvailableAt: null,
                bulletPoints: [],
                thumbnail: { status: 'unavailable' },
                isMerchListing: false,
                amazonListingStatus: 'deleted',
            },
            category: null,
            salesRank: {
                current: null,
                averages: { last30Days: null, last90Days: null },
            },
            price: null,
            demand: {
                boughtInPastMonth: null,
                salesRankDrops: {
                    last30Days: null,
                    last90Days: null,
                    last180Days: null,
                    last365Days: null,
                },
            },
        });
    });

    it('maps a current Product to the compact Search projection', () => {
        const product = mapProductToPublicProduct(createProductInfo());

        expect(mapProductToCompactProductSearch(product)).toEqual({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            title: 'Garden shirt',
            brand: 'Example brand',
            thumbnail: { status: 'unavailable' },
            isMerchListing: null,
            amazonListingStatus: 'active',
            category: { id: 12_345, name: 'Clothing' },
            salesRank: 12_345,
            price: { amountMinor: 1999, currencyCode: 'USD' },
            boughtInPastMonth: 200,
        });
    });
});

const createProductInfo = (): ProductInfo => ({
    asin: 'B012345678',
    marketplaceId: 'ATVPDKIKX0DER',
    dateFirstAvailable: '2026-01-01T00:00:00.000Z',
    title: 'Garden shirt',
    brand: 'Example brand',
    isMerchListing: null,
    amazonListingStatus: 'active',
    bullet1: 'Made for gardeners',
    bullet2: null,
    rootCategoryId: 12_345,
    rootCategoryBsr: 99_999,
    rootCategoryDisplayName: 'Clothing',
    thumbnail: { status: 'pending' },
    keepa: {
        fetchedAt: '2026-08-06T12:00:00.000Z',
        sourceUpdatedAt: '2026-08-06T11:00:00.000Z',
        firstTrackedAt: '2025-01-01T00:00:00.000Z',
        rootCategoryId: 12_345,
        currentRootCategoryBsr: 12_345,
        currentNewPrice: { amountMinor: 1999, currencyCode: 'USD' },
        monthlySold: 200,
        averageRootCategoryBsr30: 15_000,
        averageRootCategoryBsr90: 18_000,
        salesRankDrops: {
            days30: 4,
            days90: 11,
            days180: 19,
            days365: 31,
        },
    },
    freshness: { stale: false, updatedAt: '2026-08-06T12:00:00.000Z' },
});
