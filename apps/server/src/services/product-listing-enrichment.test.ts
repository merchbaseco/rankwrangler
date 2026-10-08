import { describe, expect, it, mock } from 'bun:test';
import type { ProductInfo } from '@/types';
import { getCutoutInputFingerprint } from './product-cutout-thumbnail';
import { getCutoutPublicUrl } from './product-cutout-thumbnail-media';
import {
    getProductListingEnrichments,
    type ProductListingEnrichmentDeps,
    type ProductListingEnrichmentSource,
} from './product-listing-enrichment';
import { getProductReadModel } from './product-read-model';
import { getShortNameInputFingerprint } from './product-short-name-request';

const marketplaceId = 'ATVPDKIKX0DER';
const ready = createSource('B000000001', 'Zombiecorn Unicorn Halloween Shirt');
const cold = createSource('B000000002', 'Garden Gnome Lover Funny Shirt');

describe('batch Product listing enrichment', () => {
    it('returns the same shortName and cutoutThumbnail as get for a ready Product', async () => {
        const deps = createDeps({
            shortNames: [storedShortName(ready, 'Zombiecorn')],
            cutouts: [storedCutout(ready, 'cutouts/ready.webp')],
        });

        const [enrichment] = await getProductListingEnrichments(
            { sources: [ready], include: ['shortName', 'cutoutThumbnail'] },
            deps
        );
        const product = await getProductReadModel(
            {
                ...ready.identity,
                ownerMerchbaseUserId: 'mbu_test',
                include: ['shortName', 'cutoutThumbnail'],
            },
            {
                getRequiredProduct: mock(async () => toProductInfo(ready)),
                getProductHistorySurface: mock(async () => ({}) as never),
                // What get's resolvers return for these ready rows without generating.
                getProductShortName: mock(async () => 'Zombiecorn'),
                getProductCutoutThumbnail: mock(async () =>
                    getCutoutPublicUrl('cutouts/ready.webp')
                ),
            }
        );

        expect(enrichment).toEqual({
            shortName: product.listing.shortName,
            cutoutThumbnail: product.listing.cutoutThumbnail,
            pending: [],
        });
        expect(enrichment?.cutoutThumbnail).toEqual({
            status: 'available',
            url: getCutoutPublicUrl('cutouts/ready.webp'),
        });
        expect(deps.startProductShortNameGeneration).not.toHaveBeenCalled();
        expect(deps.startProductCutoutGeneration).not.toHaveBeenCalled();
    });

    it('marks a still-generating item pending, starts its generation once, and reads in bulk', async () => {
        const deps = createDeps({
            shortNames: [storedShortName(ready, 'Zombiecorn')],
            cutouts: [storedCutout(ready, 'cutouts/ready.webp')],
        });

        const result = await getProductListingEnrichments(
            { sources: [ready, cold], include: ['shortName', 'cutoutThumbnail'] },
            deps
        );

        expect(result[1]).toEqual({
            shortName: null,
            cutoutThumbnail: { status: 'pending' },
            pending: ['shortName', 'cutoutThumbnail'],
        });
        expect(result[0]?.pending).toEqual([]);
        expect(deps.getStoredShortNames).toHaveBeenCalledTimes(1);
        expect(deps.getStoredCutouts).toHaveBeenCalledTimes(1);
        expect(deps.startProductShortNameGeneration).toHaveBeenCalledTimes(1);
        expect(deps.startProductShortNameGeneration.mock.calls[0]?.[0]).toMatchObject(
            cold.identity
        );
        expect(deps.startProductCutoutGeneration).toHaveBeenCalledTimes(1);
        expect(deps.startProductCutoutGeneration.mock.calls[0]?.[0]).toMatchObject(cold.identity);
    });

    it('settles fields that cannot or should not be generated without starting work', async () => {
        const notMerch = {
            ...createSource('B000000003', 'Plain Mug'),
            product: { ...cold.product, isMerchListing: false },
        };
        const deleted = { ...createSource('B000000004', 'Retired Shirt'), listingActive: false };
        const recentlyFailed = createSource('B000000005', 'Failed Design Shirt');
        const deps = createDeps({
            shortNames: [{ ...storedShortName(recentlyFailed, null), state: 'error' }],
            cutouts: [{ ...storedCutout(recentlyFailed, null), state: 'error' }],
        });

        const result = await getProductListingEnrichments(
            {
                sources: [notMerch, deleted, recentlyFailed],
                include: ['shortName', 'cutoutThumbnail'],
            },
            deps
        );

        expect(result[0]).toMatchObject({ shortName: null, pending: ['cutoutThumbnail'] });
        expect(result[1]).toEqual({
            shortName: null,
            cutoutThumbnail: { status: 'unavailable' },
            pending: [],
        });
        expect(result[2]).toEqual({
            shortName: null,
            cutoutThumbnail: { status: 'unavailable' },
            pending: [],
        });
        expect(deps.startProductShortNameGeneration).not.toHaveBeenCalled();
        expect(deps.startProductCutoutGeneration).toHaveBeenCalledTimes(1);
    });

    it('adds only the requested fields', async () => {
        const deps = createDeps({ shortNames: [storedShortName(ready, 'Zombiecorn')] });

        const result = await getProductListingEnrichments(
            { sources: [ready], include: ['shortName'] },
            deps
        );

        expect(result).toEqual([{ shortName: 'Zombiecorn', pending: [] }]);
        expect(deps.getStoredCutouts).not.toHaveBeenCalled();
    });
});

function createSource(asin: string, title: string): ProductListingEnrichmentSource {
    return {
        identity: { marketplaceId, asin },
        product: {
            title,
            thumbnail: {
                status: 'available',
                url: `https://m.media-amazon.com/images/I/${asin}.jpg`,
            },
            isMerchListing: true,
        },
        listingActive: true,
    };
}

function createDeps({
    shortNames = [],
    cutouts = [],
}: {
    shortNames?: ReturnType<typeof storedShortName>[];
    cutouts?: ReturnType<typeof storedCutout>[];
}) {
    return {
        getStoredShortNames: mock(async () => keyed(shortNames)),
        getStoredCutouts: mock(async () => keyed(cutouts)),
        startProductShortNameGeneration: mock(() => true),
        startProductCutoutGeneration: mock(() => true),
    } satisfies ProductListingEnrichmentDeps;
}

function keyed<Row extends { marketplaceId: string; asin: string }>(rows: Row[]) {
    return new Map(rows.map(row => [`${row.marketplaceId}:${row.asin}`, row]));
}

function storedShortName(source: ProductListingEnrichmentSource, shortName: string | null) {
    const thumbnail = source.product?.thumbnail;
    const url = thumbnail?.status === 'available' ? thumbnail.url : '';
    return {
        ...source.identity,
        inputFingerprint: getShortNameInputFingerprint(source.product?.title ?? '', url),
        state: 'ready' as 'pending' | 'ready' | 'error',
        shortName,
        claimId: '00000000-0000-4000-8000-000000000000',
        attemptedAt: new Date(),
        completedAt: new Date(),
    };
}

function storedCutout(source: ProductListingEnrichmentSource, objectKey: string | null) {
    const thumbnail = source.product?.thumbnail;
    const url = thumbnail?.status === 'available' ? thumbnail.url : '';
    return {
        ...source.identity,
        inputFingerprint: getCutoutInputFingerprint(url),
        state: 'ready' as 'pending' | 'ready' | 'error',
        objectKey,
        claimId: '00000000-0000-4000-8000-000000000000',
        attemptedAt: new Date(),
        completedAt: new Date(),
    };
}

function toProductInfo(source: ProductListingEnrichmentSource): ProductInfo {
    return {
        ...source.identity,
        dateFirstAvailable: null,
        title: source.product?.title ?? null,
        brand: null,
        isMerchListing: source.product?.isMerchListing ?? null,
        amazonListingStatus: 'active',
        bullet1: null,
        bullet2: null,
        rootCategoryId: null,
        rootCategoryBsr: null,
        rootCategoryDisplayName: null,
        thumbnail: source.product?.thumbnail ?? { status: 'unavailable' },
        keepa: null,
        freshness: { stale: false, updatedAt: '2026-08-06T12:00:00.000Z' },
    };
}
