import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import type { Product } from '@/services/product-read-model';
import { RetrievalRetryableError } from '@/services/retrieval-coordinator';
import { createProductGetProcedure, type ProductGetDeps } from './product-get';

describe('public Product tRPC boundary', () => {
    it('returns one current Product without history or retrieval metadata', async () => {
        const product = {
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            listing: {
                title: 'Garden shirt',
                brand: 'Example brand',
                firstAvailableAt: '2026-01-01T00:00:00.000Z',
                bulletPoints: ['Made for gardeners'],
                thumbnail: { status: 'available' as const, url: 'https://example.com/image.jpg' },
                isMerchListing: null,
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
        } satisfies Product;
        const getProductReadModel = mock(async () => product);
        const caller = createCaller({ getProductReadModel });

        const result = await caller.get({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'b012345678',
        });

        expect(result).toEqual(product);
        expect(result).not.toHaveProperty('history');
        expect(result).not.toHaveProperty('status');
        expect(result).not.toHaveProperty('freshness');
        expect(result).not.toHaveProperty('schemaVersion');
        expect(getProductReadModel.mock.calls[0]?.[0]).toMatchObject({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            ownerMerchbaseUserId: 'mbu_test',
        });
        expect(getProductReadModel.mock.calls[0]?.[0]).not.toHaveProperty('refresh');
        expect(getProductReadModel.mock.calls[0]?.[0]).not.toHaveProperty('metrics');
        expect(getProductReadModel.mock.calls[0]?.[0]).not.toHaveProperty('days');
        expect(getProductReadModel.mock.calls[0]?.[0]).not.toHaveProperty('format');
    });

    it('maps a retrieval deadline to a retryable public error', async () => {
        const caller = createCaller({
            getProductReadModel: mock(() => {
                throw new RetrievalRetryableError(
                    'Product is temporarily unavailable. Retry shortly.',
                    { retryAfterSeconds: 9, reason: 'deadline' }
                );
            }),
        });

        const error = await caller
            .get({ marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678' })
            .catch(reason => reason);

        expect(error).toBeInstanceOf(TRPCError);
        expect(error).toMatchObject({
            code: 'TIMEOUT',
            message: 'Product is temporarily unavailable. Retry after 9 seconds.',
        });
    });
});

const createCaller = (overrides: Partial<ProductGetDeps> = {}) =>
    router({
        get: createProductGetProcedure({
            getProductReadModel: overrides.getProductReadModel ?? mock(async () => createProduct()),
            consumeServiceAccountUsageForRequest:
                overrides.consumeServiceAccountUsageForRequest ?? mock(async () => undefined),
        }),
    }).createCaller(createPublicContext());

const createProduct = (): Product => ({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B012345678',
    listing: {
        title: null,
        brand: null,
        firstAvailableAt: null,
        bulletPoints: [],
        thumbnail: { status: 'unavailable' },
        isMerchListing: null,
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
            usageLimit: 100,
            lastResetAt: new Date(),
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
