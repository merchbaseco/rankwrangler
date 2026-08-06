import { describe, expect, it, mock } from 'bun:test';
import {
    awaitCatalogSearchRetrieval,
    type CatalogSearchRetrievalDeps,
} from './catalog-search-retrieval';
import type { OperationRecord } from './operations';

describe('Product-search dispatch boundary', () => {
    it('returns a retryable error when missing work cannot be dispatched', async () => {
        const operation = createPendingOperation();
        const dispatchOperation = mock(async () => false);
        const getOperationById = mock(async () => null);
        const deps: CatalogSearchRetrievalDeps = {
            resolveRequest: async () => ({
                kind: 'pending',
                operation,
                created: true,
                staleRunId: null,
            }),
            getRun: async () => null,
            getOperationById,
            dispatchOperation,
            sleep: async () => undefined,
        };

        await expect(
            awaitCatalogSearchRetrieval(
                {
                    term: 'dispatch failure shirts',
                    refresh: false,
                    ownerMerchbaseUserId: 'mbu_test',
                    serviceAccountId: 'account-1',
                },
                deps
            )
        ).rejects.toMatchObject({
            name: 'RetrievalRetryableError',
            retryAfterSeconds: 300,
        });
        expect(dispatchOperation.mock.calls).toHaveLength(1);
        expect(getOperationById.mock.calls).toHaveLength(0);
    });
});

const createPendingOperation = (): Extract<OperationRecord, { type: 'catalogSearch' }> => ({
    id: '11111111-1111-4111-8111-111111111111',
    type: 'catalogSearch',
    status: 'pending',
    targetKey: '33333333-3333-4333-8333-333333333333',
    input: {
        queryId: '33333333-3333-4333-8333-333333333333',
        marketplaceId: 'ATVPDKIKX0DER',
        term: 'shirts',
        page: 0,
        priority: 'interactive',
        trigger: 'requested',
        ownerMerchbaseUserId: 'mbu_test',
    },
    resource: null,
    error: null,
    dispatchedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-06T12:00:00.000Z'),
    updatedAt: new Date('2026-08-06T12:00:00.000Z'),
});
