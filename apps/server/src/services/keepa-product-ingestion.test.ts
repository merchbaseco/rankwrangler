import { describe, expect, it, mock } from 'bun:test';
import { ingestKeepaProduct } from '@/services/keepa-product-ingestion';

const input = {
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0MERCH001',
    fetchedAt: new Date('2026-07-22T14:00:00.000Z'),
    product: {
        asin: 'B0MERCH001',
        monthlySold: 100,
        salesRankReference: 12_345,
        stats: {
            current: [-1, 1_999, -1, 54_321],
        },
    },
    import: {
        requestParams: { days: 365 },
        responsePayload: { products: [{ asin: 'B0MERCH001' }] },
        tokensConsumed: 2,
        tokensLeft: 18,
        refillInMs: 3_000,
        refillRate: 20,
    },
};

describe('ingestKeepaProduct', () => {
    it('sends normalized Product state and history through one atomic persistence call', async () => {
        const persistAcceptedIngestion = mock(async () => ({
            importId: 'import-1',
            importedAt: new Date('2026-07-22T14:00:01.000Z'),
        }));

        const result = await ingestKeepaProduct(input, { persistAcceptedIngestion });

        expect(persistAcceptedIngestion.mock.calls).toHaveLength(1);
        expect(persistAcceptedIngestion.mock.calls[0]?.[0]).toMatchObject({
            product: {
                asin: 'B0MERCH001',
                keepaCurrentBsr: 54_321,
                keepaFetchedAt: input.fetchedAt,
            },
            import: input.import,
        });
        expect(result).toMatchObject({
            importId: 'import-1',
            normalized: {
                product: {
                    keepaMonthlySold: 100,
                },
            },
        });
    });

    it('does not report accepted freshness when atomic persistence fails', async () => {
        const persistenceError = new Error('history persistence failed');
        const persistAcceptedIngestion = mock(async () => {
            throw persistenceError;
        });

        await expect(
            ingestKeepaProduct(input, { persistAcceptedIngestion })
        ).rejects.toBe(persistenceError);
        expect(persistAcceptedIngestion.mock.calls).toHaveLength(1);
    });

    it('includes the Operation in the same atomic persistence call', async () => {
        const persistAcceptedIngestion = mock(async () => ({
            importId: 'import-1',
            importedAt: new Date('2026-07-22T14:00:01.000Z'),
        }));

        await ingestKeepaProduct(
            {
                ...input,
                operationId: '11111111-1111-4111-8111-111111111111',
            },
            { persistAcceptedIngestion }
        );

        expect(persistAcceptedIngestion.mock.calls[0]?.[0]).toMatchObject({
            operationId: '11111111-1111-4111-8111-111111111111',
            product: { asin: 'B0MERCH001' },
            import: input.import,
        });
    });

    it('rejects a Product with a different ASIN before persistence', async () => {
        const persistAcceptedIngestion = mock(async () => ({
            importId: 'import-1',
            importedAt: new Date('2026-07-22T14:00:01.000Z'),
        }));

        await expect(
            ingestKeepaProduct(
                {
                    ...input,
                    product: { ...input.product, asin: 'B0OTHER001' },
                },
                { persistAcceptedIngestion }
            )
        ).rejects.toThrow('Keepa Product ASIN B0OTHER001 does not match B0MERCH001');
        expect(persistAcceptedIngestion.mock.calls).toHaveLength(0);
    });
});
