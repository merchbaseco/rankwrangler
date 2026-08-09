import { describe, expect, it, mock } from 'bun:test';
import { getProductAppReadModel, mapProductProvenance } from './product-app-read-model';

describe('app Product read model', () => {
    it('keeps provider provenance outside the public Product shape', async () => {
        const getProductDetails = mock(async (input: { asin: string }) => ({
            identity: { marketplaceId: 'ATVPDKIKX0DER', asin: input.asin },
            product: null,
            availability: 'unavailable' as const,
        }));
        const getProductProvenance = mock(async () => ({
            spApi: createProviderProvenance(),
            keepa: createProviderProvenance(),
        }));

        const result = await getProductAppReadModel(
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678', includeProvenance: true },
            { getProductDetails, getProductProvenance }
        );

        expect(result.provenance.spApi).toEqual(createProviderProvenance());
        expect(getProductDetails.mock.calls[0]?.[0]).toMatchObject({ asin: 'B012345678' });
        expect(getProductProvenance.mock.calls[0]?.[0]).toEqual({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
        });
    });

    it('maps source timestamps and supplied categories without inferring ownership', () => {
        const result = mapProductProvenance({
            product: {
                title: 'Garden shirt',
                brand: null,
                bullet1: null,
                bullet2: null,
                thumbnailUrl: 'https://example.com/image.jpg',
                dateFirstAvailable: null,
                rootCategoryId: 12_345,
                rootCategoryBsr: 12_345,
                spApiFetchedAt: new Date('2026-08-06T12:00:00.000Z'),
                spApiResolvedAt: new Date('2026-08-06T12:00:00.000Z'),
                keepaFetchedAt: new Date('2026-08-06T11:00:00.000Z'),
                keepaSourceUpdatedAt: new Date('2026-08-06T10:00:00.000Z'),
            } as never,
            spApi: {
                latestAttemptAt: null,
                latestSuccessAt: null,
                latestError: null,
            },
            keepa: {
                latestAttemptAt: null,
                latestSuccessAt: null,
                latestError: 'temporary failure',
                retryAt: new Date('2026-08-06T13:00:00.000Z'),
            },
        });

        expect(result).toEqual({
            spApi: {
                lastAttemptAt: '2026-08-06T12:00:00.000Z',
                lastSuccessAt: '2026-08-06T12:00:00.000Z',
                sourceObservedAt: null,
                suppliedDataCategories: ['listing', 'category', 'sales rank'],
                latestError: null,
                retryAt: null,
            },
            keepa: {
                lastAttemptAt: '2026-08-06T11:00:00.000Z',
                lastSuccessAt: '2026-08-06T11:00:00.000Z',
                sourceObservedAt: '2026-08-06T10:00:00.000Z',
                suppliedDataCategories: ['sales rank', 'price', 'demand', 'history'],
                latestError: 'temporary failure',
                retryAt: '2026-08-06T13:00:00.000Z',
            },
        });
    });

    it('does not claim Keepa categories when a successful payload has no values', () => {
        const result = mapProductProvenance({
            product: {
                keepaFetchedAt: new Date('2026-08-06T11:00:00.000Z'),
                keepaSourceUpdatedAt: null,
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
            } as never,
            spApi: { latestAttemptAt: null, latestSuccessAt: null, latestError: null },
            keepa: {
                latestAttemptAt: null,
                latestSuccessAt: null,
                latestError: null,
                retryAt: null,
            },
        });

        expect(result.keepa.suppliedDataCategories).toEqual([]);
    });
});

const createProviderProvenance = () => ({
    lastAttemptAt: null,
    lastSuccessAt: null,
    sourceObservedAt: null,
    suppliedDataCategories: [],
    latestError: null,
    retryAt: null,
});
