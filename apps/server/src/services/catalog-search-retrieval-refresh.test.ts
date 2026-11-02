import { describe, expect, it, mock } from 'bun:test';
import { awaitCatalogSearchRetrieval } from './catalog-search-retrieval';
import {
    createCompletedOperation,
    createDeps,
    createPendingOperation,
    createRun,
} from './catalog-search-retrieval-test-fixtures';

describe('Keyword results with refresh', () => {
    it('waits for a replacement run on refresh even when a stale run is available', async () => {
        const staleRun = createRun('2026-08-05T11:00:00.000Z');
        const freshRun = createRun('2026-08-06T12:00:02.000Z');
        const operation = createPendingOperation();
        let operationReads = 0;
        const getRun = mock((runId: string) => {
            expect(runId).toBe(freshRun.id);
            return Promise.resolve(freshRun);
        });
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'pending' as const,
                operation,
                created: true,
                staleRunId: staleRun.id,
            }),
            getOperationById: () => {
                operationReads += 1;
                return Promise.resolve(
                    operationReads === 1
                        ? operation
                        : createCompletedOperation(operation, freshRun.id)
                );
            },
            getRun,
            sleep: async () => undefined,
        });

        const result = await awaitCatalogSearchRetrieval(
            {
                term: 'shirts',
                refresh: true,
                ownerMerchbaseUserId: 'mbu_test',
                serviceAccountId: 'account-1',
                now: new Date('2026-08-06T12:00:00.000Z'),
            },
            deps
        );

        expect(result.searchedAt).toBe(freshRun.sourceCompletedAt);
        expect(operationReads).toBe(2);
        expect(deps.dispatchOperation.mock.calls).toHaveLength(1);
        expect(getRun.mock.calls).toHaveLength(1);
    });

    it('does not return stale evidence on refresh during a retry cooldown', async () => {
        const staleRun = createRun('2026-08-05T11:00:00.000Z');
        const deps = createDeps({
            resolveRequest: async () => ({
                kind: 'cooldown' as const,
                retryAfterSeconds: 120,
                staleRunId: staleRun.id,
            }),
        });

        await expect(
            awaitCatalogSearchRetrieval(
                {
                    term: 'cooldown shirts',
                    refresh: true,
                    ownerMerchbaseUserId: 'mbu_test',
                    serviceAccountId: 'account-1',
                },
                deps
            )
        ).rejects.toMatchObject({
            name: 'RetrievalRetryableError',
            retryAfterSeconds: 120,
        });
        expect(deps.getRun.mock.calls).toHaveLength(0);
        expect(deps.dispatchOperation.mock.calls).toHaveLength(0);
    });
});
