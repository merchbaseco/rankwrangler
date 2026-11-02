import { describe, expect, it } from 'bun:test';
import type { OperationRecord } from '@/services/operations';
import type { CatalogSearchWorkerDeps } from './catalog-search';

describe('Catalog search completion', () => {
    it('announces the run before saving Product history', async () => {
        const { runCatalogSearchOperation } = await import('./catalog-search');
        const events: string[] = [];
        const deps = {
            claimOperationWork: async () => operation,
            evaluateAccess: async () => ({ kind: 'allowed' as const }),
            searchProvider: async () => ({
                products: [{ asin: 'B0MERCH001' }],
                internalUsage: {
                    tokensConsumed: 10,
                    tokensLeft: 90,
                    refillInMs: 3000,
                    refillRate: 20,
                },
            }),
            persistSuccess: async () => ({
                runId: 'run-1',
                saveHistory: async () => {
                    events.push('history');
                },
            }),
            completeWithError: async () => operation,
            notifyCompleted: () => {
                events.push('announced');
            },
        } as unknown as CatalogSearchWorkerDeps;

        const result = await runCatalogSearchOperation(operation.id, deps);

        expect(result).toMatchObject({ status: 'completed' });
        expect(events).toEqual(['announced', 'history']);
    });
});

const operation = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'catalogSearch',
    status: 'pending',
    targetKey: '22222222-2222-4222-8222-222222222222',
    input: {
        queryId: '22222222-2222-4222-8222-222222222222',
        marketplaceId: 'ATVPDKIKX0DER',
        term: 'retro gardening shirt',
        page: 0,
        priority: 'interactive',
        trigger: 'requested',
        ownerMerchbaseUserId: 'mbu_test',
    },
    resource: null,
    error: null,
    dispatchedAt: new Date('2026-07-23T12:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
} as OperationRecord;
