import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import type { ProductFamilyLookupEntry } from '@/services/product-family-lookup';
import { createProductFamilyProcedure, type ProductFamilyDeps } from './product-family';

const MARKETPLACE = 'ATVPDKIKX0DER';
const PARENT = 'B0PARENT00';
const CHILD = 'B0CHILD000';
const UNKNOWN = 'B0UNKNOWN0';

describe('public Product family lookup', () => {
    it('returns a known family for a parent ASIN', async () => {
        const known: ProductFamilyLookupEntry = {
            status: 'known',
            marketplaceId: MARKETPLACE,
            requestedAsin: PARENT,
            familyAsin: PARENT,
            variationsCheckedAt: '2026-10-01T00:00:00.000Z',
            variants: [
                {
                    asin: CHILD,
                    attributes: { size: null, color: null, fit: null, style: null },
                },
            ],
        };
        const lookupProductFamilies = mock(async () => [known]);
        const caller = createCaller({ lookupProductFamilies });

        const result = await caller.family({ marketplaceId: MARKETPLACE, asins: [PARENT] });

        expect(result).toEqual([known]);
        expect(lookupProductFamilies.mock.calls[0]?.[0]).toEqual({
            marketplaceId: MARKETPLACE,
            asins: [PARENT],
        });
    });

    it('returns the resolved family for a child/variant ASIN', async () => {
        const known: ProductFamilyLookupEntry = {
            status: 'known',
            marketplaceId: MARKETPLACE,
            requestedAsin: CHILD,
            familyAsin: PARENT,
            variationsCheckedAt: '2026-10-01T00:00:00.000Z',
            variants: [
                {
                    asin: CHILD,
                    attributes: { size: null, color: null, fit: null, style: null },
                },
            ],
        };
        const lookupProductFamilies = mock(async () => [known]);
        const caller = createCaller({ lookupProductFamilies });

        const result = await caller.family({ asins: [CHILD.toLowerCase()] });

        expect(result).toEqual([known]);
        expect(lookupProductFamilies.mock.calls[0]?.[0]).toMatchObject({
            asins: [CHILD],
        });
    });

    it('returns unknown for ASINs RankWrangler has not stored', async () => {
        const unknown: ProductFamilyLookupEntry = {
            status: 'unknown',
            marketplaceId: MARKETPLACE,
            requestedAsin: UNKNOWN,
        };
        const lookupProductFamilies = mock(async () => [unknown]);
        const caller = createCaller({ lookupProductFamilies });

        const result = await caller.family({ asins: [UNKNOWN] });

        expect(result).toEqual([unknown]);
        expect(result[0]).not.toHaveProperty('familyAsin');
        expect(result[0]).not.toHaveProperty('variants');
    });

    it('defaults marketplace to US and charges one usage unit per ASIN', async () => {
        const consumeServiceAccountUsageForRequest = mock(async () => undefined);
        const lookupProductFamilies = mock(async () => [
            { status: 'unknown' as const, marketplaceId: MARKETPLACE, requestedAsin: UNKNOWN },
            {
                status: 'unknown' as const,
                marketplaceId: MARKETPLACE,
                requestedAsin: 'B0UNKNOWN1',
            },
        ]);
        const caller = createCaller({
            consumeServiceAccountUsageForRequest,
            lookupProductFamilies,
        });

        await caller.family({ asins: [UNKNOWN, 'B0UNKNOWN1'] });

        expect(consumeServiceAccountUsageForRequest).toHaveBeenCalledWith(expect.anything(), 2);
        expect(lookupProductFamilies.mock.calls[0]?.[0]).toMatchObject({
            marketplaceId: MARKETPLACE,
        });
    });

    it('rejects duplicate ASINs', async () => {
        const caller = createCaller();
        const error = await caller
            .family({ asins: [PARENT, PARENT.toLowerCase()] })
            .catch(reason => reason);

        expect(error).toBeInstanceOf(TRPCError);
        expect(error).toMatchObject({ code: 'BAD_REQUEST' });
    });
});

const createCaller = (overrides: Partial<ProductFamilyDeps> = {}) =>
    router({
        family: createProductFamilyProcedure({
            lookupProductFamilies: mock(async () => []),
            consumeServiceAccountUsageForRequest: mock(async () => undefined),
            ...overrides,
        }),
    }).createCaller({
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
    } as Context);
