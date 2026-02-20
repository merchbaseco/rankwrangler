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
    loadKeepaProductHistory: (params: {
        marketplaceId: string;
        asin: string;
        days: number;
        queuePriority: 'manual' | 'background';
    }) => Promise<KeepaImportSummary>;
    getKeepaHistoryDaysForAsin: (params: {
        marketplaceId: string;
        asin: string;
    }) => Promise<number>;
    getKeepaHistoryRefreshQueueItem: (params: {
        marketplaceId: string;
        asin: string;
    }) => Promise<{
        id: string;
        marketplaceId: string;
        asin: string;
    } | null>;
    removeKeepaHistoryRefreshQueueItem: (params: {
        marketplaceId: string;
        asin: string;
    }) => Promise<void>;
    shouldKeepaHistoryRefreshAsin: (params: {
        marketplaceId: string;
        asin: string;
    }) => Promise<
        | {
              shouldRefresh: true;
              reason: 'eligible';
          }
        | {
              shouldRefresh: false;
              reason: 'product_missing' | 'not_eligible';
          }
    >;
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
    });

    it('removes queue item for non-retryable NOT_FOUND errors', async () => {
        const { fetchKeepaHistoryForAsin } = await loadSubject();
        const { deps, calls } = createDeps({
            loadKeepaProductHistory: async () => {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Keepa returned no product history for this ASIN',
                });
            },
        });

        await expect(fetchKeepaHistoryForAsin(params, deps)).resolves.toBeUndefined();
        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(1);
    });

    it('removes queue item and rethrows retryable BAD_GATEWAY errors', async () => {
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
        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(1);
    });

    it('removes queue item and throws when Keepa returns non-success summary', async () => {
        const { fetchKeepaHistoryForAsin } = await loadSubject();
        const { deps, calls } = createDeps({
            loadKeepaProductHistory: async () => createSummary({ status: 'error' }),
        });

        await expect(fetchKeepaHistoryForAsin(params, deps)).rejects.toThrow(
            'Keepa import failed'
        );
        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toHaveLength(1);
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
    });
});

const createDeps = (
    overrides: Partial<FetchKeepaHistoryForAsinDeps> = {}
) => {
    const calls = {
        loadKeepaProductHistory: mock(async () => createSummary({ status: 'success' })),
        getKeepaHistoryDaysForAsin: mock(async () => 365),
        getKeepaHistoryRefreshQueueItem: mock(async () => ({
            id: 'queue-1',
            marketplaceId: params.marketplaceId,
            asin: params.asin,
        })),
        removeKeepaHistoryRefreshQueueItem: mock(async () => {}),
        shouldKeepaHistoryRefreshAsin: mock(async () => ({
            shouldRefresh: true as const,
            reason: 'eligible' as const,
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
    process.env.LICENSE_SECRET =
        process.env.LICENSE_SECRET ?? '12345678901234567890123456789012';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
};
