import { describe, expect, it, mock } from 'bun:test';
import { resolveProductDetails, resolveProducts } from './product-retrieval-work';

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

    it('leaves Product state and durable queue work untouched when SP-API rejects', async () => {
        const identity = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' };
        const ensureProductIdentities = mock(() => Promise.resolve(1));
        const persistProductSyncResults = mock(() => Promise.resolve(undefined));
        const deleteSpApiSyncQueueItemsForIdentities = mock(() => Promise.resolve(undefined));

        await expect(
            resolveProducts([identity], {
                ensureProductIdentities,
                searchCatalogItemsByAsins: mock(() => Promise.reject(new Error('SP-API rejected'))),
                persistProductSyncResults,
                deleteSpApiSyncQueueItemsForIdentities,
            } as never)
        ).rejects.toThrow('SP-API rejected');

        expect(ensureProductIdentities).not.toHaveBeenCalled();
        expect(persistProductSyncResults).not.toHaveBeenCalled();
        expect(deleteSpApiSyncQueueItemsForIdentities).not.toHaveBeenCalled();
    });
});

const createAsin = (index: number) => `B${String(index).padStart(9, '0')}`;
