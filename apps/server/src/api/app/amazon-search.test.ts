import { describe, expect, it, mock } from 'bun:test';
import { retrieveAmazonSearchProducts } from '@/api/app/amazon-search.js';

describe('Amazon keyword Product retrieval', () => {
    it('sends keyword identities through the shared background Product service', async () => {
        const retrieve = mock(async (input: Parameters<typeof import('@/services/product-retrieval.js')['getProducts']>[0]) => {
            expect(input.fetchPolicy).toBe('background');
            expect(input.rediscoveredAt).toEqual(new Date('2026-08-03T12:00:00.000Z'));
            return input.products.map(identity => ({
                identity,
                product: null,
                availability: 'pending' as const,
            }));
        });

        const result = await retrieveAmazonSearchProducts(
            [
                createKeywordItem({ asin: 'B000123456' }),
                createKeywordItem({ asin: 'B000987654' }),
            ],
            retrieve
        );

        expect(result.map(read => read.identity.asin)).toEqual(['B000123456', 'B000987654']);
        expect(retrieve.mock.calls).toHaveLength(1);
    });
});

const createKeywordItem = ({ asin }: { asin: string }) => ({
    asin,
    marketplaceId: 'ATVPDKIKX0DER',
    dateFirstAvailable: null,
    title: null,
    brand: null,
    bullet1: null,
    bullet2: null,
    isMerchListing: false,
    rootCategoryBsr: null,
    thumbnail: { status: 'unavailable' as const },
    facets: [],
    fetchedAt: '2026-08-03T12:00:00.000Z',
});
