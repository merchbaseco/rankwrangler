import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';

type KeepaImportSummary = {
    importId: string;
    marketplaceId: string;
    asin: string;
    days: number;
    pointsStored: number;
    pointCounts: Record<string, number>;
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
    status: 'success' | 'error';
    cached: boolean;
    importedAt: string;
    errorCode: string | null;
    errorMessage: string | null;
    responsePayload: Record<string, unknown> | null;
};

type FetchKeepaHistoryForAsinDeps = {
    createEventLogSafe: (input: unknown) => Promise<void>;
    loadKeepaProductHistory: (params: {
        marketplaceId: string;
        asin: string;
        days: number;
        queuePriority?: 'manual' | 'background';
    }) => Promise<KeepaImportSummary>;
    getKeepaHistoryDaysForAsin: (params: {
        marketplaceId: string;
        asin: string;
    }) => Promise<number>;
    getKeepaHistoryRefreshQueueItem: (params: { marketplaceId: string; asin: string }) => Promise<{
        id: string;
        marketplaceId: string;
        asin: string;
    } | null>;
    removeKeepaHistoryRefreshQueueItem: (params: {
        marketplaceId: string;
        asin: string;
    }) => Promise<void>;
    recordKeepaHistoryRefreshFailure: (params: {
        marketplaceId: string;
        asin: string;
        errorMessage: string;
    }) => Promise<{ failureCount: number; retryDelayMs: number } | null>;
    shouldKeepaHistoryRefreshAsin: (params: { marketplaceId: string; asin: string }) => Promise<
        | {
              shouldRefresh: true;
              reason: 'never_fetched' | 'stale_product';
          }
        | {
              shouldRefresh: false;
              reason: 'fresh_product' | 'product_missing' | 'not_eligible';
          }
    >;
};

type EventLogInput = {
    level: 'info' | 'error';
    status: 'success' | 'failed';
    category: 'history';
    action: 'history.sync.background';
    primitiveType: 'history';
    message: string;
    detailsJson: Record<string, unknown>;
    primitiveId: string;
    marketplaceId: string;
    asin: string;
};

const params = {
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B012345678',
};

describe('fetchKeepaHistoryForAsin', () => {
    it('removes queue item when Keepa import succeeds', async () => {
        const { fetchKeepaHistoryForAsin } = await loadSubject();
        const { deps, calls } = createDeps({
            loadKeepaProductHistory: async () => createSummary({ status: 'success' }),
        });

        await fetchKeepaHistoryForAsin(params, deps);

        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(1);
        const eventLog = getSingleEventLogCall(calls.createEventLogSafe.mock.calls);
        expect(eventLog.level).toBe('info');
        expect(eventLog.status).toBe('success');
        expect(eventLog.action).toBe('history.sync.background');
        expect(eventLog.message).toBe(`Synced history for ${params.asin}.`);
        expect(eventLog.primitiveId).toBe(params.asin);
        expect(eventLog.marketplaceId).toBe(params.marketplaceId);
        expect(eventLog.asin).toBe(params.asin);
        expect(eventLog.detailsJson.source).toBe('keepa_background_job');
        expect(eventLog.detailsJson.days).toBe(365);
    });

    it('retains queue item and rethrows NOT_FOUND errors', async () => {
        const { fetchKeepaHistoryForAsin } = await loadSubject();
        const { deps, calls } = createDeps({
            loadKeepaProductHistory: async () => {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Keepa returned no product history for this ASIN',
                });
            },
        });

        await expect(fetchKeepaHistoryForAsin(params, deps)).rejects.toThrow(
            'Keepa returned no product history for this ASIN'
        );
        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(0);
        expect(calls.recordKeepaHistoryRefreshFailure.mock.calls).toHaveLength(1);
        const eventLog = getSingleEventLogCall(calls.createEventLogSafe.mock.calls);
        expect(eventLog.level).toBe('error');
        expect(eventLog.status).toBe('failed');
        expect(eventLog.action).toBe('history.sync.background');
        expect(eventLog.detailsJson.error).toBe('Keepa returned no product history for this ASIN');
        expect(eventLog.detailsJson.source).toBe('keepa_background_job');
    });

    it('retains queue item and rethrows retryable BAD_GATEWAY errors', async () => {
        const { fetchKeepaHistoryForAsin } = await loadSubject();
        const { deps, calls } = createDeps({
            loadKeepaProductHistory: async () => {
                throw new TRPCError({
                    code: 'BAD_GATEWAY',
                    message: 'Keepa request failed',
                });
            },
        });

        await expect(fetchKeepaHistoryForAsin(params, deps)).rejects.toThrow(
            'Keepa request failed'
        );
        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(0);
        expect(calls.recordKeepaHistoryRefreshFailure.mock.calls).toHaveLength(1);
        const eventLog = getSingleEventLogCall(calls.createEventLogSafe.mock.calls);
        expect(eventLog.level).toBe('error');
        expect(eventLog.status).toBe('failed');
        expect(eventLog.action).toBe('history.sync.background');
        expect(eventLog.detailsJson.error).toBe('Keepa request failed');
        expect(eventLog.detailsJson.source).toBe('keepa_background_job');
    });

    it('retains queue item and throws when Keepa returns non-success summary', async () => {
        const { fetchKeepaHistoryForAsin } = await loadSubject();
        const { deps, calls } = createDeps({
            loadKeepaProductHistory: async () => createSummary({ status: 'error' }),
        });

        await expect(fetchKeepaHistoryForAsin(params, deps)).rejects.toThrow('Keepa import failed');
        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(0);
        expect(calls.recordKeepaHistoryRefreshFailure.mock.calls).toHaveLength(1);
        const eventLog = getSingleEventLogCall(calls.createEventLogSafe.mock.calls);
        expect(eventLog.level).toBe('error');
        expect(eventLog.status).toBe('failed');
        expect(eventLog.action).toBe('history.sync.background');
        expect(eventLog.detailsJson.error).toBe('Keepa import failed');
        expect(eventLog.detailsJson.source).toBe('keepa_background_job');
    });

    it('removes queue item when ASIN is no longer eligible', async () => {
        const { fetchKeepaHistoryForAsin } = await loadSubject();
        const { deps, calls } = createDeps({
            shouldKeepaHistoryRefreshAsin: async () => ({
                shouldRefresh: false,
                reason: 'not_eligible',
            }),
        });

        await fetchKeepaHistoryForAsin(params, deps);

        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(1);
        expect(calls.loadKeepaProductHistory.mock.calls).toHaveLength(0);
        expect(calls.createEventLogSafe.mock.calls).toHaveLength(0);
    });

    it('removes queue item without fetching when Product Keepa data is already fresh', async () => {
        const { fetchKeepaHistoryForAsin } = await loadSubject();
        const { deps, calls } = createDeps({
            shouldKeepaHistoryRefreshAsin: async () => ({
                shouldRefresh: false,
                reason: 'fresh_product',
            }),
        });

        await fetchKeepaHistoryForAsin(params, deps);

        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(1);
        expect(calls.loadKeepaProductHistory.mock.calls).toHaveLength(0);
    });
});

const getSingleEventLogCall = (calls: unknown[][]) => {
    expect(calls).toHaveLength(1);

    return calls[0][0] as EventLogInput;
};

const createDeps = (overrides: Partial<FetchKeepaHistoryForAsinDeps> = {}) => {
    const calls = {
        createEventLogSafe: mock(async () => {}),
        loadKeepaProductHistory: mock(async () => createSummary({ status: 'success' })),
        getKeepaHistoryDaysForAsin: mock(async () => 365),
        getKeepaHistoryRefreshQueueItem: mock(async () => ({
            id: 'queue-1',
            marketplaceId: params.marketplaceId,
            asin: params.asin,
        })),
        removeKeepaHistoryRefreshQueueItem: mock(async () => {}),
        recordKeepaHistoryRefreshFailure: mock(async () => ({
            failureCount: 1,
            retryDelayMs: 300_000,
        })),
        shouldKeepaHistoryRefreshAsin: mock(async () => ({
            shouldRefresh: true as const,
            reason: 'stale_product' as const,
        })),
    };

    const deps: FetchKeepaHistoryForAsinDeps = {
        ...calls,
        ...overrides,
    };

    return {
        deps,
        calls,
    };
};

const createSummary = ({
    status,
}: {
    status: KeepaImportSummary['status'];
}): KeepaImportSummary => {
    return {
        importId: 'import-1',
        marketplaceId: params.marketplaceId,
        asin: params.asin,
        days: 365,
        pointsStored: 10,
        pointCounts: {
            bsr_main: 10,
        },
        tokensConsumed: 1,
        tokensLeft: 20,
        refillInMs: 0,
        refillRate: 5,
        status,
        cached: false,
        importedAt: new Date().toISOString(),
        errorCode: status === 'error' ? 'ERR' : null,
        errorMessage: status === 'error' ? 'Keepa import failed' : null,
        responsePayload: {},
    };
};

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./fetch-keepa-history-for-asin.js');
};

const seedRequiredEnvForTests = () => {
    process.env.SPAPI_REFRESH_TOKEN = process.env.SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.SPAPI_CLIENT_ID = process.env.SPAPI_CLIENT_ID ?? 'test-client';
    process.env.SPAPI_APP_CLIENT_SECRET = process.env.SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
    process.env.CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY ?? 'pk_test_rankwrangler';
    process.env.CLERK_JWT_KEY = process.env.CLERK_JWT_KEY ?? 'test-jwt-key';
    process.env.CLERK_ISSUER = process.env.CLERK_ISSUER ?? 'https://clerk.test';
    process.env.CLERK_AUTHORIZED_PARTIES =
        process.env.CLERK_AUTHORIZED_PARTIES ?? 'https://app.test';
    process.env.CLERK_WEBHOOK_SIGNING_SECRET =
        process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? 'test-webhook-secret';
};
