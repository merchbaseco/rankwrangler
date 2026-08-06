import { describe, expect, it, mock } from 'bun:test';
import type { OperationRecord } from './operations.js';
import { getProductHistoryOperationSurface } from './product-history-operation-surface.js';

describe('dashboard Product-history compatibility surface', () => {
    it('keeps stored points and the pending Operation-shaped app contract', async () => {
        const operation = createPendingOperation();
        const response = await getProductHistoryOperationSurface(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                metric: 'bsrMain',
                limit: 5000,
                days: 365,
                format: 'points',
                bucket: 'auto',
                refresh: 'none',
                ownerMerchbaseUserId: 'mbu_test',
            },
            {
                getRequiredProduct: mock(async () => ({ asin: 'B012345678' }) as never),
                getProductHistoryPoints: mock(async () => ({
                    latestImportAt: '2026-08-06T12:00:00.000Z',
                    categoryNames: {},
                    points: [],
                })),
                hasRecentSuccessfulKeepaImportForAsin: mock(async () => true),
                requestProductHistoryRefresh: mock(async () => {
                    await Promise.resolve();
                    throw new Error('refresh none must not start work');
                }),
                getLatestProductHistoryOperation: mock(async () => operation),
            }
        );

        expect(response).toMatchObject({
            latestImportAt: '2026-08-06T12:00:00.000Z',
            collecting: true,
            syncTriggered: false,
            operation: {
                id: operation.id,
                status: 'pending',
                retryAfterSeconds: 2,
            },
        });
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
