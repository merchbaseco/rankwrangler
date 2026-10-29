import { describe, expect, it, mock } from 'bun:test';
import {
    createHistoryRefreshHandlers,
    isKeepaSyncStale,
    KEEPA_STALE_REFRESH_MS,
    operationPollingInterval,
    shouldAutoSyncKeepa,
} from './keepa-sync-state';

const nowMs = Date.parse('2026-02-24T00:00:00.000Z');

describe('isKeepaSyncStale', () => {
    it('is stale when the latest import is missing or unparseable', () => {
        expect(isKeepaSyncStale({ keepaLastSyncAt: null, nowMs })).toBe(true);
        expect(isKeepaSyncStale({ keepaLastSyncAt: 'not-a-date', nowMs })).toBe(true);
    });

    it('is fresh inside the 48 hour window and stale past it', () => {
        const fresh = new Date(nowMs - KEEPA_STALE_REFRESH_MS + 60_000).toISOString();
        const stale = new Date(nowMs - KEEPA_STALE_REFRESH_MS - 1).toISOString();
        expect(isKeepaSyncStale({ keepaLastSyncAt: fresh, nowMs })).toBe(false);
        expect(isKeepaSyncStale({ keepaLastSyncAt: stale, nowMs })).toBe(true);
    });
});

describe('shouldAutoSyncKeepa', () => {
    const settled = {
        hasChecked: false,
        isRankQueryError: false,
        isRankQueryLoading: false,
        isStale: true,
    };

    it('syncs once the rank read settles on stale history', () => {
        expect(shouldAutoSyncKeepa(settled)).toBe(true);
    });

    it('waits for the read, skips errors and fresh history, and runs once', () => {
        expect(shouldAutoSyncKeepa({ ...settled, isRankQueryLoading: true })).toBe(false);
        expect(shouldAutoSyncKeepa({ ...settled, isRankQueryError: true })).toBe(false);
        expect(shouldAutoSyncKeepa({ ...settled, isStale: false })).toBe(false);
        expect(shouldAutoSyncKeepa({ ...settled, hasChecked: true })).toBe(false);
    });
});

describe('operationPollingInterval', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    it('uses the durable retry hint while pending', () => {
        expect(operationPollingInterval({ id, retryAfterSeconds: 2, status: 'pending' })).toBe(
            2000
        );
    });

    it('stops polling once the Operation completes', () => {
        expect(
            operationPollingInterval({
                error: { code: 'PROVIDER_UNAVAILABLE', message: 'failed' },
                id,
                resource: null,
                status: 'completed',
            })
        ).toBe(false);
    });
});

describe('createHistoryRefreshHandlers', () => {
    const identity = {
        asin: 'B012345678',
        marketplaceId: 'ATVPDKIKX0DER',
        operationId: '11111111-1111-4111-8111-111111111111',
    };
    const create = () => {
        const invalidateOperation = mock(async (_id: string) => undefined);
        const invalidateHistory = mock(async () => undefined);
        return {
            handlers: createHistoryRefreshHandlers({
                ...identity,
                invalidateHistory,
                invalidateOperation,
            }),
            invalidateHistory,
            invalidateOperation,
        };
    };

    it('invalidates the Operation and history reads on its completion', async () => {
        const { handlers, invalidateHistory, invalidateOperation } = create();
        await handlers.onCompleted(identity);
        expect(invalidateOperation.mock.calls).toEqual([[identity.operationId]]);
        expect(invalidateHistory.mock.calls).toEqual([[]]);
    });

    it('invalidates the same reads after a reconnect', async () => {
        const { handlers, invalidateHistory, invalidateOperation } = create();
        await handlers.onReconnect();
        expect(invalidateOperation.mock.calls).toEqual([[identity.operationId]]);
        expect(invalidateHistory.mock.calls).toEqual([[]]);
    });

    it('ignores a completion from another Operation', async () => {
        const { handlers, invalidateHistory, invalidateOperation } = create();
        await handlers.onCompleted({
            ...identity,
            operationId: '22222222-2222-4222-8222-222222222222',
        });
        expect(invalidateOperation.mock.calls).toHaveLength(0);
        expect(invalidateHistory.mock.calls).toHaveLength(0);
    });
});
