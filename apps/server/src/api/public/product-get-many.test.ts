import { describe, expect, it, mock } from 'bun:test';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import { createProductGetManyProcedure, type ProductGetManyDeps } from './product-get-many';

describe('public Product getMany boundary', () => {
    it('normalizes ASINs, defaults the marketplace and charges one usage unit per ASIN', async () => {
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

        await caller.getMany({ asins: ['b000000001', 'B000000002'] });

        expect(consumeServiceAccountUsageForRequest).toHaveBeenCalledWith(expect.anything(), 2);
        expect(getBasicProductReadModels.mock.calls[0]?.[0].products).toEqual(products);
    });

    it('reads every ASIN in the requested marketplace', async () => {
        const getBasicProductReadModels = mock(() => Promise.resolve([]));
        const caller = createCaller({ getBasicProductReadModels });

        await caller.getMany({ asins: ['B000000001'], marketplaceId: 'A1F83G8C2ARO7P' });

        expect(getBasicProductReadModels.mock.calls[0]?.[0].products).toEqual([
            { marketplaceId: 'A1F83G8C2ARO7P', asin: 'B000000001' },
        ]);
    });

    it('rejects duplicate ASINs (in any case), batches larger than 200 and the old products list', async () => {
        const caller = createCaller();

        await expect(caller.getMany({ asins: ['B000000001', 'b000000001'] })).rejects.toMatchObject(
            { code: 'BAD_REQUEST', message: expect.stringContaining('unique') }
        );
        await expect(
            caller.getMany({
                asins: Array.from(
                    { length: 201 },
                    (_, index) => `B${String(index).padStart(9, '0')}`
                ),
            })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
        await expect(
            caller.getMany({
                products: [{ marketplaceId: 'ATVPDKIKX0DER', asin: 'B000000001' }],
            } as never)
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('rejects include because getMany returns basic fields only', async () => {
        const caller = createCaller();

        await expect(
            caller.getMany({
                asins: ['B000000001'],
                include: ['shortName'],
            } as never)
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
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
