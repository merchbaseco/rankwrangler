import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { OperationRecord } from '@/services/operations.js';
import { runProductHistoryOperation } from './refresh-product-history-operation.js';

describe('Product-history Operation worker', () => {
    it('persists history and successful completion through one atomic load call', async () => {
        const operation = createPendingOperation();
        const deps = createDeps({
            claimOperationWork: async () => operation,
        });

        const result = await runProductHistoryOperation(operation.id, deps);

        expect(result).toEqual({ didWork: true, status: 'completed' });
        expect(deps.loadHistory.mock.calls[0]?.[0]).toEqual({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            days: 3650,
            operationId: operation.id,
        });
        expect(deps.completeWithError.mock.calls).toHaveLength(0);
        expect(deps.notifyCompleted.mock.calls).toEqual([
            [
                {
                    operationId: operation.id,
                    marketplaceId: 'ATVPDKIKX0DER',
                    asin: 'B012345678',
                },
            ],
        ]);
    });

    it('no-ops without another provider request when the receipt is already completed', async () => {
        const deps = createDeps({
            claimOperationWork: async () => null,
        });

        expect(
            await runProductHistoryOperation('11111111-1111-4111-8111-111111111111', deps)
        ).toEqual({ didWork: false, status: 'already_completed_or_active' });
        expect(deps.loadHistory.mock.calls).toHaveLength(0);
    });

    it('rejects a misrouted Catalog Operation without completing it as a history failure', async () => {
        const operation = createPendingCatalogOperation();
        const deps = createDeps({
            claimOperationWork: async () => operation,
        });

        await expect(runProductHistoryOperation(operation.id, deps)).rejects.toThrow(
            `Operation ${operation.id} is not a Product-history refresh.`
        );
        expect(deps.loadHistory.mock.calls).toHaveLength(0);
        expect(deps.completeWithError.mock.calls).toHaveLength(0);
        expect(deps.notifyCompleted.mock.calls).toHaveLength(0);
    });

    it('completes exhausted provider failure with a sanitized error', async () => {
        const operation = createPendingOperation();
        const deps = createDeps({
            claimOperationWork: async () => operation,
            loadHistory: async () => {
                throw new TRPCError({
                    code: 'BAD_GATEWAY',
                    message: 'Keepa payload included secret diagnostics',
                });
            },
        });

        const result = await runProductHistoryOperation(operation.id, deps);

        expect(result).toEqual({ didWork: true, status: 'failed' });
        expect(deps.completeWithError.mock.calls[0]?.[0]).toEqual({
            operationId: operation.id,
            error: {
                code: 'PROVIDER_UNAVAILABLE',
                message: 'Product history collection failed. Retry the request shortly.',
            },
        });
        expect(deps.notifyCompleted.mock.calls).toEqual([
            [
                {
                    operationId: operation.id,
                    marketplaceId: 'ATVPDKIKX0DER',
                    asin: 'B012345678',
                },
            ],
        ]);
    });

    it('releases claimed work when access verification is unavailable', async () => {
        const operation = createPendingOperation();
        const deps = createDeps({
            claimOperationWork: async () => operation,
            evaluateAccess: async () => ({ kind: 'unavailable' as const }),
            releaseOperationWork: async () => undefined,
        });

        expect(await runProductHistoryOperation(operation.id, deps)).toEqual({
            didWork: false,
            status: 'skipped_access_unavailable',
        });
        expect(deps.releaseOperationWork.mock.calls).toEqual([[operation.id]]);
        expect(deps.loadHistory.mock.calls).toHaveLength(0);
    });

    it('does not run a pending operation without an explicit owner', async () => {
        const operation = {
            ...createPendingOperation(),
            input: {
                ...createPendingOperation().input,
                ownerMerchbaseUserId: undefined,
            },
        } as unknown as OperationRecord;
        const deps = createDeps({
            claimOperationWork: async () => operation,
            releaseOperationWork: async () => undefined,
        });

        expect(await runProductHistoryOperation(operation.id, deps)).toEqual({
            didWork: false,
            status: 'skipped_access_unavailable',
        });
        expect(deps.releaseOperationWork.mock.calls).toEqual([[operation.id]]);
        expect(deps.evaluateAccess.mock.calls).toHaveLength(0);
        expect(deps.loadHistory.mock.calls).toHaveLength(0);
    });

    it('completes claimed work with a sanitized denial when access is revoked', async () => {
        const operation = createPendingOperation();
        const deps = createDeps({
            claimOperationWork: async () => operation,
            evaluateAccess: async () => ({ kind: 'denied' as const }),
        });

        expect(await runProductHistoryOperation(operation.id, deps)).toEqual({
            didWork: true,
            status: 'skipped_access_denied',
        });
        expect(deps.completeWithError.mock.calls[0]?.[0].error).toEqual({
            code: 'ACCESS_DENIED',
            message: 'RankWrangler access is no longer granted.',
        });
        expect(deps.loadHistory.mock.calls).toHaveLength(0);
    });
});

const createDeps = (overrides: Record<string, unknown> = {}) => ({
    claimOperationWork: mock(async () => createPendingOperation()),
    loadHistory: mock(async () => ({ status: 'success' as const })),
    completeWithError: mock(async () => createPendingOperation()),
    evaluateAccess: mock(async () => ({ kind: 'allowed' as const })),
    releaseOperationWork: mock(async () => undefined),
    createEventLogSafe: mock(async () => undefined),
    notifyCompleted: mock(() => undefined),
    ...Object.fromEntries(
        Object.entries(overrides).map(([key, implementation]) => [
            key,
            typeof implementation === 'function' ? mock(implementation) : implementation,
        ])
    ),
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
    dispatchedAt: new Date('2026-07-23T12:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-07-23T12:00:00.000Z'),
    updatedAt: new Date('2026-07-23T12:00:00.000Z'),
});

const createPendingCatalogOperation = (): OperationRecord => ({
    ...createPendingOperation(),
    type: 'catalogSearch',
    targetKey: '22222222-2222-4222-8222-222222222222',
    input: {
        queryId: '22222222-2222-4222-8222-222222222222',
        marketplaceId: 'ATVPDKIKX0DER',
        term: 'retro gardening shirt',
        page: 0,
        priority: 'interactive',
        trigger: 'requested',
    },
    resource: null,
});
