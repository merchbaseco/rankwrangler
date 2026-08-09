import { describe, expect, it, mock } from 'bun:test';
import { resolveProductDetails } from './product-retrieval-work';

describe('Product detail work', () => {
    it('groups identities by marketplace and keeps SP-API batches at 20 products', async () => {
        const usProducts = Array.from({ length: 45 }, (_, index) => ({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: createAsin(index),
        }));
        const ukProducts = Array.from({ length: 2 }, (_, index) => ({
            marketplaceId: 'A1F83G8C2ARO7P',
            asin: createAsin(index + 100),
        }));
        const searchCatalogItemsByAsins = mock(() => Promise.resolve([]));
        const persistProductSyncResults = mock(() => Promise.resolve(undefined));

        await resolveProductDetails([...usProducts, ...ukProducts], {
            searchCatalogItemsByAsins,
            persistProductSyncResults,
        } as never);

        expect(searchCatalogItemsByAsins.mock.calls).toHaveLength(4);
        expect(
            searchCatalogItemsByAsins.mock.calls
                .map(call => call[1].length)
                .sort((left, right) => left - right)
        ).toEqual([2, 5, 20, 20]);
        for (const [marketplaceId, asins] of searchCatalogItemsByAsins.mock.calls) {
            expect(asins.length).toBeLessThanOrEqual(20);
            const expectedMarketplace = asins[0].startsWith('B0000001')
                ? 'A1F83G8C2ARO7P'
                : 'ATVPDKIKX0DER';
            expect(marketplaceId).toBe(expectedMarketplace);
        }
        expect(persistProductSyncResults.mock.calls).toHaveLength(4);
    });
});

const createAsin = (index: number) => `B${String(index).padStart(9, '0')}`;
