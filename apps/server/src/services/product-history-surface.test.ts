import { describe, expect, it, mock } from 'bun:test';
import type { OperationRecord } from './operations.js';
import { getProductHistorySurface } from './product-history-surface.js';

describe('Product-history request surface', () => {
    it('returns existing history immediately with the shared pending Operation', async () => {
        const deps = {
            getRequiredProduct: mock(async () => ({ asin: 'B012345678' }) as never),
            getProductHistoryPoints: mock(async () => ({
                latestImportAt: null,
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
            requestProductHistoryRefresh: mock(async () => ({
                operation: {
                    id: '11111111-1111-4111-8111-111111111111',
                    type: 'productHistoryRefresh' as const,
                    status: 'pending' as const,
                    retryAfterSeconds: 2 as const,
                    createdAt: '2026-07-23T12:00:00.000Z',
                    updatedAt: '2026-07-23T12:00:00.000Z',
                },
                created: true,
            })),
            getPendingProductHistoryOperation: mock(async () => createPendingOperation()),
        };

        const response = await getProductHistorySurface(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                metrics: ['bsr'],
                limit: 5000,
                days: 365,
                format: 'agent',
                bucket: 'day',
                refresh: 'force',
                ownerMerchbaseUserId: 'mbu_test',
            },
            deps
        );

        expect(response.status).toBe('collecting');
        expect(response.series.bsr?.buckets.length).toBeGreaterThan(0);
        expect(response.operation).toMatchObject({
            id: '11111111-1111-4111-8111-111111111111',
            status: 'pending',
            retryAfterSeconds: 2,
        });
        expect(deps.requestProductHistoryRefresh.mock.calls).toHaveLength(1);
    });
});

const createPendingOperation = (): OperationRecord => ({
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
    dispatchedAt: new Date('2026-07-23T12:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
});
