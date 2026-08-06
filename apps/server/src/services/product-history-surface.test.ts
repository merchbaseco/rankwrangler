import { describe, expect, it, mock } from 'bun:test';
import type { OperationRecord } from './operations.js';
import type { AgentHistoryResponse } from './product-history-agent.js';
import { getProductHistorySurface } from './product-history-surface.js';

describe('Product-history request surface', () => {
    it('returns available stored history with one freshness envelope', async () => {
        const deps = {
            getRequiredProduct: mock(async () => ({ asin: 'B012345678' }) as never),
            getProductHistoryPoints: mock(async () => ({
                latestImportAt: '2026-08-06T12:00:00.000Z',
                categoryNames: {},
                points: [
                    {
                        categoryId: 7_141_123_011,
                        categoryName: 'Clothing',
                        observedAt: '2026-07-20T00:00:00.000Z',
                        keepaMinutes: 82_624_320,
                        value: 12_345,
                        isMissing: false,
                    },
                ],
            })),
            hasRecentSuccessfulKeepaImportForAsin: mock(async () => false),
            ensureProductHistoryWork: mock(async () => {
                await Promise.resolve();
                throw new Error('stored history must not start provider work');
            }),
            getOperationById: mock(async () => null),
            getLatestProductHistoryOperation: mock(async () => null),
            sleep: mock(async () => undefined),
            now: () => new Date('2026-08-06T12:01:00.000Z'),
        };

        const response = (await getProductHistorySurface(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                metrics: ['bsr'],
                limit: 5000,
                days: 365,
                startAt: new Date('2026-07-20T00:00:00.000Z'),
                endAt: new Date('2026-08-06T00:00:00.000Z'),
                format: 'agent',
                bucket: 'day',
                refresh: false,
                ownerMerchbaseUserId: 'mbu_test',
            },
            deps
        )) as AgentHistoryResponse;

        expect(response.status).toBe('ready');
        expect(response.series.bsr?.buckets.length).toBeGreaterThan(0);
        expect(response.freshness).toEqual({
            stale: false,
            updatedAt: '2026-08-06T12:00:00.000Z',
        });
        expect(response).not.toHaveProperty('operation');
        expect(response).not.toHaveProperty('collecting');
        expect(response).not.toHaveProperty('syncTriggered');
        expect(deps.ensureProductHistoryWork.mock.calls).toHaveLength(0);
    });

    it('waits for missing history coverage and returns the completed history', async () => {
        const operation = createPendingOperation();
        let historyReadCount = 0;
        let operationReadCount = 0;
        const deps = {
            getRequiredProduct: mock(async () => ({ asin: 'B012345678' }) as never),
            getProductHistoryPoints: mock(async () => {
                await Promise.resolve();
                historyReadCount += 1;
                return {
                    latestImportAt: '2026-08-06T12:00:00.000Z',
                    categoryNames: {},
                    points: [
                        {
                            categoryId: 7_141_123_011,
                            categoryName: 'Clothing',
                            observedAt:
                                historyReadCount > 1
                                    ? '2026-01-01T11:00:00.000Z'
                                    : '2026-07-20T11:00:00.000Z',
                            keepaMinutes: 82_624_320,
                            value: 12_345,
                            isMissing: false,
                        },
                    ],
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

        const response = (await getProductHistorySurface(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                metrics: ['bsr'],
                limit: 5000,
                days: 365,
                startAt: new Date('2026-01-01T00:00:00.000Z'),
                format: 'agent',
                bucket: 'day',
                refresh: false,
                ownerMerchbaseUserId: 'mbu_test',
            },
            deps
        )) as AgentHistoryResponse;

        expect(response.status).toBe('ready');
        expect(response.freshness).toEqual({
            stale: false,
            updatedAt: '2026-08-06T12:00:00.000Z',
        });
        expect(response).not.toHaveProperty('operation');
        expect(deps.ensureProductHistoryWork.mock.calls).toHaveLength(1);
        expect(deps.getOperationById.mock.calls).toHaveLength(2);
    });

    it('returns an empty history when a valid Product has no provider history', async () => {
        const operation = {
            ...createPendingOperation(),
            status: 'completed' as const,
            error: {
                code: 'RESOURCE_NOT_FOUND' as const,
                message: 'Product history is unavailable for this Product.',
            },
            completedAt: new Date('2026-08-06T12:00:00.000Z'),
            updatedAt: new Date('2026-08-06T12:00:00.000Z'),
        };
        const deps = {
            getRequiredProduct: mock(async () => ({ asin: 'B012345678' }) as never),
            getProductHistoryPoints: mock(async () => ({
                latestImportAt: null,
                categoryNames: {},
                points: [],
            })),
            hasRecentSuccessfulKeepaImportForAsin: mock(async () => false),
            ensureProductHistoryWork: mock(async () => ({
                operation: createPendingOperation(),
                created: true,
                dispatched: true,
            })),
            getOperationById: mock(async () => operation),
            getLatestProductHistoryOperation: mock(async () => null),
            sleep: mock(async () => undefined),
            now: () => new Date('2026-08-06T12:01:00.000Z'),
        };

        const response = (await getProductHistorySurface(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                metrics: ['bsr'],
                limit: 5000,
                days: 365,
                format: 'agent',
                bucket: 'day',
                refresh: false,
                ownerMerchbaseUserId: 'mbu_test',
            },
            deps
        )) as AgentHistoryResponse;

        expect(response.status).toBe('empty');
        expect(response.freshness).toEqual({ stale: true, updatedAt: null });
        expect(deps.ensureProductHistoryWork.mock.calls).toHaveLength(1);
        expect(response).not.toHaveProperty('operation');
    });

    it('waits for refresh work when stored history is stale', async () => {
        const operation = createPendingOperation();
        let historyReadCount = 0;
        const deps = {
            getRequiredProduct: mock(async () => ({ asin: 'B012345678' }) as never),
            getProductHistoryPoints: mock(async () => {
                await Promise.resolve();
                historyReadCount += 1;
                const isFresh = historyReadCount > 1;
                return {
                    latestImportAt: isFresh
                        ? '2026-08-06T12:00:00.000Z'
                        : '2026-08-04T12:00:00.000Z',
                    categoryNames: {},
                    points: [
                        {
                            categoryId: 7_141_123_011,
                            categoryName: 'Clothing',
                            observedAt: isFresh
                                ? '2026-08-06T11:00:00.000Z'
                                : '2026-08-04T11:00:00.000Z',
                            keepaMinutes: 82_624_320,
                            value: isFresh ? 12_345 : 22_222,
                            isMissing: false,
                        },
                    ],
                };
            }),
            hasRecentSuccessfulKeepaImportForAsin: mock(async () => false),
            ensureProductHistoryWork: mock(async () => ({
                operation,
                created: true,
                dispatched: true,
            })),
            getOperationById: mock(async () => ({
                ...operation,
                status: 'completed' as const,
                resource: {
                    type: 'productHistory' as const,
                    marketplaceId: operation.input.marketplaceId,
                    asin: operation.input.asin,
                },
                completedAt: new Date('2026-08-06T12:00:00.000Z'),
                updatedAt: new Date('2026-08-06T12:00:00.000Z'),
            })),
            getLatestProductHistoryOperation: mock(async () => null),
            sleep: mock(async () => undefined),
            now: () => new Date('2026-08-06T12:01:00.000Z'),
        };

        const response = (await getProductHistorySurface(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                metrics: ['bsr'],
                limit: 5000,
                days: 365,
                format: 'agent',
                bucket: 'day',
                refresh: true,
                ownerMerchbaseUserId: 'mbu_test',
            },
            deps
        )) as AgentHistoryResponse;

        expect(response.status).toBe('ready');
        expect(response.freshness).toEqual({
            stale: false,
            updatedAt: '2026-08-06T12:00:00.000Z',
        });
        expect(response.series.bsr?.buckets).toContainEqual(['2026-08-06', 12_345]);
        expect(deps.ensureProductHistoryWork.mock.calls).toHaveLength(1);
    });
});

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
