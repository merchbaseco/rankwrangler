import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context.js';
import { router } from '@/api/trpc.js';
import type { OperationRecord } from '@/services/operations.js';
import type { AgentHistoryResponse } from '@/services/product-history-agent.js';
import { getProductHistorySurface } from '@/services/product-history-surface.js';
import { RetrievalRetryableError } from '@/services/retrieval-coordinator.js';
import {
    createProductGetHistoryProcedure,
    type ProductGetHistoryDeps,
} from './product-get-history.js';

describe('public Product-history tRPC boundary', () => {
    it('returns the shared freshness envelope without exposing work state', async () => {
        const response = {
            schemaVersion: 2 as const,
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            status: 'ready' as const,
            freshness: {
                stale: false,
                updatedAt: '2026-08-06T12:00:00.000Z',
            },
            range: {
                startAt: '2026-08-05T00:00:00.000Z',
                endAt: '2026-08-06T00:00:00.000Z',
                bucket: 'day' as const,
            },
            series: {},
        };
        const getProductHistorySurface = mock(async () => response);
        const deps: ProductGetHistoryDeps = {
            getProductHistorySurface: getProductHistorySurface as never,
            consumeServiceAccountUsageForRequest: mock(async () => undefined),
        };
        const caller = router({
            getHistory: createProductGetHistoryProcedure(deps),
        }).createCaller(createPublicContext());

        const result = await caller.getHistory({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'b012345678',
            format: 'agent',
            metrics: ['bsr'],
            bucket: 'day',
            days: 30,
            limit: 100,
        });

        expect(result).toEqual(response);
        expect(result).not.toHaveProperty('operation');
        expect(result).not.toHaveProperty('collecting');
        expect(getProductHistorySurface.mock.calls[0]?.[0]).toMatchObject({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            refresh: false,
            ownerMerchbaseUserId: 'mbu_test',
        });
    });

    it('maps temporary retrieval failure to a provider-neutral retryable error', async () => {
        const deps: ProductGetHistoryDeps = {
            getProductHistorySurface: mock(async () => {
                await Promise.resolve();
                throw new RetrievalRetryableError(
                    'Product history is temporarily unavailable. Retry shortly.',
                    { retryAfterSeconds: 7, reason: 'capacity' }
                );
            }) as never,
            consumeServiceAccountUsageForRequest: mock(async () => undefined),
        };
        const caller = router({
            getHistory: createProductGetHistoryProcedure(deps),
        }).createCaller(createPublicContext());

        const error = await caller
            .getHistory({
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                format: 'agent',
                metrics: ['bsr'],
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

    it('coalesces concurrent missing-history callers through the shared retrieval path', async () => {
        const operation = createPendingOperation();
        let historyReadCount = 0;
        let operationReadCount = 0;
        const surfaceDeps = {
            getRequiredProduct: mock(async () => ({ asin: 'B012345678' }) as never),
            getProductHistoryPoints: mock(async () => {
                await Promise.resolve();
                historyReadCount += 1;
                const available = historyReadCount > 2;
                return {
                    latestImportAt: available ? '2026-08-06T12:00:00.000Z' : null,
                    categoryNames: {},
                    points: available
                        ? [
                              {
                                  categoryId: 7_141_123_011,
                                  categoryName: 'Clothing',
                                  observedAt: '2026-08-06T11:00:00.000Z',
                                  keepaMinutes: 82_624_320,
                                  value: 12_345,
                                  isMissing: false,
                              },
                          ]
                        : [],
                };
            }),
            hasRecentSuccessfulKeepaImportForAsin: mock(async () => false),
            ensureProductHistoryWork: mock(async () => ({
                operation,
                created: true,
                dispatched: true,
            })),
            getOperationById: mock(async () => {
                await Promise.resolve();
                operationReadCount += 1;
                return operationReadCount === 1
                    ? operation
                    : ({
                          ...operation,
                          status: 'completed',
                          resource: {
                              type: 'productHistory',
                              marketplaceId: operation.input.marketplaceId,
                              asin: operation.input.asin,
                          },
                          completedAt: new Date('2026-08-06T12:00:00.000Z'),
                          updatedAt: new Date('2026-08-06T12:00:00.000Z'),
                      } satisfies OperationRecord);
            }),
            getLatestProductHistoryOperation: mock(async () => null),
            sleep: mock(async () => undefined),
            now: () => new Date('2026-08-06T12:01:00.000Z'),
        };
        const deps: ProductGetHistoryDeps = {
            getProductHistorySurface: input => getProductHistorySurface(input, surfaceDeps),
            consumeServiceAccountUsageForRequest: mock(async () => undefined),
        };
        const caller = router({
            getHistory: createProductGetHistoryProcedure(deps),
        }).createCaller(createPublicContext());
        const input = {
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            format: 'agent' as const,
            metrics: ['bsr' as const],
            bucket: 'day' as const,
            days: 30,
            limit: 100,
        };

        const [first, second] = (await Promise.all([
            caller.getHistory(input),
            caller.getHistory(input),
        ])) as [AgentHistoryResponse, AgentHistoryResponse];

        expect(first.status).toBe('ready');
        expect(second.status).toBe('ready');
        expect(first.freshness).toEqual({
            stale: false,
            updatedAt: '2026-08-06T12:00:00.000Z',
        });
        expect(second.freshness).toEqual(first.freshness);
        expect(surfaceDeps.ensureProductHistoryWork.mock.calls).toHaveLength(1);
        expect(surfaceDeps.getOperationById.mock.calls).toHaveLength(2);
    });

    it('fails fast during a provider cooldown without enqueueing another operation', async () => {
        const latestOperation = {
            ...createPendingOperation(),
            status: 'completed' as const,
            error: {
                code: 'PROVIDER_UNAVAILABLE' as const,
                message: 'History collection failed.',
            },
            completedAt: new Date('2026-08-06T12:00:00.000Z'),
            updatedAt: new Date('2026-08-06T12:00:00.000Z'),
        };
        const ensureProductHistoryWork = mock(async () => {
            await Promise.resolve();
            throw new Error('cooldown must not enqueue work');
        });
        const surfaceDeps = {
            getRequiredProduct: mock(async () => ({ asin: 'B012345678' }) as never),
            getProductHistoryPoints: mock(async () => ({
                latestImportAt: null,
                categoryNames: {},
                points: [],
            })),
            hasRecentSuccessfulKeepaImportForAsin: mock(async () => false),
            ensureProductHistoryWork,
            getOperationById: mock(async () => null),
            getLatestProductHistoryOperation: mock(async () => latestOperation),
            sleep: mock(async () => undefined),
            now: () => new Date('2026-08-06T12:00:01.000Z'),
        };
        const deps: ProductGetHistoryDeps = {
            getProductHistorySurface: input => getProductHistorySurface(input, surfaceDeps),
            consumeServiceAccountUsageForRequest: mock(async () => undefined),
        };
        const caller = router({
            getHistory: createProductGetHistoryProcedure(deps),
        }).createCaller(createPublicContext());

        const error = await caller
            .getHistory({
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                format: 'agent',
                metrics: ['bsr'],
                bucket: 'day',
                days: 30,
                limit: 100,
            })
            .catch(reason => reason);

        expect(error).toMatchObject({
            code: 'TIMEOUT',
            message: 'Product history is temporarily unavailable. Retry after 300 seconds.',
        });
        expect(ensureProductHistoryWork.mock.calls).toHaveLength(0);
    });
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

const createPendingOperation = (): Extract<OperationRecord, { type: 'productHistoryRefresh' }> => ({
    id: '11111111-1111-4111-8111-111111111111',
    type: 'productHistoryRefresh',
    status: 'pending',
    targetKey: 'ATVPDKIKX0DER:B012345678',
    input: {
        marketplaceId: 'ATVPDKIKX0DER',
        asin: 'B012345678',
        days: 3650,
        ownerMerchbaseUserId: 'mbu_test',
    },
    resource: null,
    error: null,
    dispatchedAt: new Date('2026-08-06T12:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-06T12:00:00.000Z'),
    updatedAt: new Date('2026-08-06T12:00:00.000Z'),
});
