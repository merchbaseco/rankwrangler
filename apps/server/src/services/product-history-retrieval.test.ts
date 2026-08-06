import { describe, expect, it, mock } from 'bun:test';
import type { OperationRecord } from './operations.js';
import { awaitProductHistoryRetrieval } from './product-history-retrieval.js';

describe('Product-history retrieval policy', () => {
    it('allows explicit refresh after a cached no-history cooldown', async () => {
        const pending = createPendingOperation();
        const previousEmpty = {
            ...pending,
            status: 'completed' as const,
            error: {
                code: 'RESOURCE_NOT_FOUND' as const,
                message: 'Product history is unavailable for this Product.',
            },
            completedAt: new Date('2026-08-06T11:50:00.000Z'),
            updatedAt: new Date('2026-08-06T11:50:00.000Z'),
        };
        const ensureProductHistoryWork = mock(async () => ({
            operation: pending,
            created: true,
            dispatched: true,
        }));

        const result = await awaitProductHistoryRetrieval(
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B012345678',
                ownerMerchbaseUserId: 'mbu_test',
                refresh: true,
            },
            {
                getLatestProductHistoryOperation: mock(async () => previousEmpty),
                ensureProductHistoryWork,
                getOperationById: mock(async () => ({
                    ...pending,
                    status: 'completed' as const,
                    error: previousEmpty.error,
                    completedAt: new Date('2026-08-06T12:00:00.000Z'),
                    updatedAt: new Date('2026-08-06T12:00:00.000Z'),
                })),
                sleep: mock(async () => undefined),
                now: () => new Date('2026-08-06T12:00:00.000Z'),
            }
        );

        expect(result).toBe('empty');
        expect(ensureProductHistoryWork.mock.calls).toHaveLength(1);
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
