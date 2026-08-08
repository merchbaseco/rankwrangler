import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context';
import { router } from '@/api/trpc';
import type { PublicProductHistory } from '@/services/public-product-history';
import { RetrievalRetryableError } from '@/services/retrieval-coordinator';
import { createProductHistoryProcedure, type ProductHistoryDeps } from './product-history';

describe('public Product-history tRPC boundary', () => {
    it('returns only the compact ProductHistory contract', async () => {
        const response = createHistoryResponse();
        const getPublicProductHistory = mock(async () => response);
        const caller = createCaller({ getPublicProductHistory });

        const result = await caller.history({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'b012345678',
            metrics: ['salesRank', 'price'],
            bucket: 'day',
            days: 30,
            limit: 100,
        });

        expect(result).toEqual(response);
        expect(result).not.toHaveProperty('status');
        expect(result).not.toHaveProperty('freshness');
        expect(result).not.toHaveProperty('operation');
        expect(result).not.toHaveProperty('schemaVersion');
        expect(getPublicProductHistory.mock.calls[0]?.[0]).toMatchObject({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            metrics: ['salesRank', 'price'],
            ownerMerchbaseUserId: 'mbu_test',
        });
        expect(getPublicProductHistory.mock.calls[0]?.[0]).not.toHaveProperty('refresh');
        expect(getPublicProductHistory.mock.calls[0]?.[0]).not.toHaveProperty('format');
    });

    it('maps temporary retrieval failure to a provider-neutral retryable error', async () => {
        const caller = createCaller({
            getPublicProductHistory: mock(() => {
                throw new RetrievalRetryableError(
                    'Product history is temporarily unavailable. Retry shortly.',
                    { retryAfterSeconds: 7, reason: 'capacity' }
                );
            }),
        });

        const error = await caller
            .history({
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                metrics: ['salesRank'],
                bucket: 'day',
                days: 30,
                limit: 100,
            })
            .catch(reason => reason);

        expect(error).toBeInstanceOf(TRPCError);
        expect(error).toMatchObject({
            code: 'TIMEOUT',
            message: 'Product history is temporarily unavailable. Retry after 7 seconds.',
        });
    });

    it('rejects removed refresh and legacy-format inputs', async () => {
        const caller = createCaller();

        const error = await caller
            .history({
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                refresh: true,
                format: 'legacy',
            } as never)
            .catch(reason => reason);

        expect(error).toMatchObject({ code: 'BAD_REQUEST' });
    });
});

const createCaller = (overrides: Partial<ProductHistoryDeps> = {}) =>
    router({
        history: createProductHistoryProcedure({
            getPublicProductHistory:
                overrides.getPublicProductHistory ?? mock(async () => createHistoryResponse()),
            consumeServiceAccountUsageForRequest:
                overrides.consumeServiceAccountUsageForRequest ?? mock(async () => undefined),
        }),
    }).createCaller(createPublicContext());

const createHistoryResponse = (): PublicProductHistory => ({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B012345678',
    range: {
        startAt: '2026-08-01T00:00:00.000Z',
        endAt: '2026-08-02T00:00:00.000Z',
        interval: 'day',
    },
    series: {
        salesRank: {
            unit: 'rank',
            category: null,
            points: [['2026-08-01', 12_345]],
            summary: { first: 12_345, latest: 12_345, min: 12_345, max: 12_345 },
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
