import { describe, expect, it, mock } from 'bun:test';
import {
    recoverStaleProductHistoryOperations,
    requestProductHistoryRefresh,
    type ProductHistoryOperationDeps,
} from './product-history-operations.js';
import type { OperationRecord } from './operations.js';

describe('Product-history Operation dispatch', () => {
    it('shares one pending receipt and one job across concurrent requests', async () => {
        const operation = createPendingOperation();
        let dispatchClaimed = false;
        const deps = createDeps({
            ensurePendingOperation: async () => ({
                operation,
                created: !dispatchClaimed,
            }),
            claimOperationDispatch: async () => {
                if (dispatchClaimed) {
                    return false;
                }
                dispatchClaimed = true;
                return true;
            },
        });

        const [first, second] = await Promise.all([
            requestProductHistoryRefresh(
                { marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678' },
                deps
            ),
            requestProductHistoryRefresh(
                { marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678' },
                deps
            ),
        ]);

        expect(first.operation.id).toBe(operation.id);
        expect(second.operation.id).toBe(operation.id);
        expect(deps.sendJob.mock.calls).toHaveLength(1);
    });

    it('leaves enqueue failures recoverable and redispatches the same receipt', async () => {
        const operation = createPendingOperation();
        let dispatchClaimed = false;
        const deps = createDeps({
            claimOperationDispatch: async () => {
                if (dispatchClaimed) {
                    return false;
                }
                dispatchClaimed = true;
                return true;
            },
            sendJob: async () => {
                throw new Error('queue unavailable');
            },
            releaseOperationDispatch: async () => {
                dispatchClaimed = false;
            },
            listStalePendingOperations: async () => [operation],
        });

        const receipt = await requestProductHistoryRefresh(
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678' },
            deps
        );
        expect(receipt.operation.status).toBe('pending');
        expect(deps.releaseOperationDispatch.mock.calls).toHaveLength(1);

        deps.sendJob.mockImplementation(async () => 'job-2');
        const recovered = await recoverStaleProductHistoryOperations(deps);

        expect(recovered).toBe(1);
        expect(deps.sendJob.mock.calls[1]?.[0]).toEqual({ operationId: operation.id });
    });

    it('releases dispatch when the queue does not acknowledge a job', async () => {
        const deps = createDeps({
            sendJob: async () => null,
        });

        const receipt = await requestProductHistoryRefresh(
            { marketplaceId: 'ATVPDKIKX0DER', asin: 'B012345678' },
            deps
        );

        expect(receipt.operation.status).toBe('pending');
        expect(deps.releaseOperationDispatch.mock.calls).toHaveLength(1);
    });
});

const createDeps = (overrides: Partial<ProductHistoryOperationDeps> = {}) => {
    const operation = createPendingOperation();
    return {
        ensurePendingOperation: mock(
            overrides.ensurePendingOperation ?? (async () => ({ operation, created: true }))
        ),
        claimOperationDispatch: mock(overrides.claimOperationDispatch ?? (async () => true)),
        releaseOperationDispatch: mock(overrides.releaseOperationDispatch ?? (async () => {})),
        listStalePendingOperations: mock(
            overrides.listStalePendingOperations ?? (async () => [])
        ),
        sendJob: mock(overrides.sendJob ?? (async () => 'job-1')),
    };
};

const createPendingOperation = (): OperationRecord => ({
    id: '11111111-1111-4111-8111-111111111111',
    type: 'productHistoryRefresh',
    status: 'pending',
    targetKey: 'ATVPDKIKX0DER:B012345678',
    input: {
        marketplaceId: 'ATVPDKIKX0DER',
        asin: 'B012345678',
        days: 3650,
    },
    resource: null,
    error: null,
    dispatchedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
});
