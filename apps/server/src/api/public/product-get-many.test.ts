import { describe, expect, it, mock } from 'bun:test';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { createProductGetManyProcedure, type ProductGetManyDeps } from './product-get-many';

describe('public Product getMany boundary', () => {
    it('normalizes ASINs and charges one usage unit per Product pair', async () => {
        const products = [
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' },
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000002' },
        ];
        const getBasicProductReadModels = mock(() => Promise.resolve([]));
        const consumeServiceAccountUsageForRequest = mock(() => Promise.resolve(undefined));
        const caller = createCaller({
            getBasicProductReadModels,
            consumeServiceAccountUsageForRequest,
        });

        await caller.getMany({
            products: products.map(product => ({ ...product, asin: product.asin.toLowerCase() })),
        });

        expect(consumeServiceAccountUsageForRequest).toHaveBeenCalledWith(expect.anything(), 2);
        expect(getBasicProductReadModels.mock.calls[0]?.[0].products).toEqual(products);
    });

    it('rejects duplicate Product pairs and batches larger than 200', async () => {
        const caller = createCaller();
        const product = { marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' };

        await expect(caller.getMany({ products: [product, product] })).rejects.toMatchObject({
            code: 'BAD_REQUEST',
        });
        await expect(
            caller.getMany({
                products: Array.from({ length: 201 }, (_, index) => ({
                    marketplaceId: 'ATVPDKIKX0DER',
                    asin: `B${String(index).padStart(9, '0')}`,
                })),
            })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
});

const createCaller = (overrides: Partial<ProductGetManyDeps> = {}) =>
    router({
        getMany: createProductGetManyProcedure({
            getBasicProductReadModels:
                overrides.getBasicProductReadModels ?? mock(() => Promise.resolve([])),
            consumeServiceAccountUsageForRequest:
                overrides.consumeServiceAccountUsageForRequest ??
                mock(() => Promise.resolve(undefined)),
        }),
    }).createCaller(createPublicContext());

const createPublicContext = () =>
    ({
        user: { sub: 'mbu_test' },
        isAdmin: false,
        authType: 'access',
        credentialKind: 'api_key',
        authExpiresAtMs: null,
        accessPrincipal: {
            id: '11111111-1111-4111-8111-111111111111',
            service: 'rankwrangler',
            merchbaseUserId: 'mbu_test',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
            usageToday: 0,
            usageCount: 0,
            usageLimit: 100_000,
            lastResetAt: new Date(),
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
