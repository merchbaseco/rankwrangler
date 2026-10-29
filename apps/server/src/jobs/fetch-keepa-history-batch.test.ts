import { describe, expect, it, mock } from 'bun:test';
import { KeepaCapacityDeferredError } from '@/services/providers/keepa/keepa-capacity-types';

const marketplaceId = 'ATVPDKIKX0DER';

describe('fetchKeepaHistoryBatch', () => {
    it('removes synced products and records failures without failing the batch', async () => {
        const { fetchKeepaHistoryBatch } = await loadSubject();
        const { deps, calls } = createDeps({
            loadKeepaHistoryBatch: mock(async ({ asins }: { asins: readonly string[] }) =>
                asins.map(asin =>
                    asin === 'B000000002'
                        ? { asin, status: 'failed' as const, message: 'no product' }
                        : { asin, status: 'success' as const }
                )
            ),
        });

        const result = await fetchKeepaHistoryBatch(
            { marketplaceId, asins: ['B000000001', 'B000000002'] },
            deps
        );

        expect(result).toEqual({ synced: 1, failed: 1 });
        expect(calls.loadKeepaHistoryBatch.mock.calls).toHaveLength(1);
        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls).toEqual([
            [{ marketplaceId, asin: 'B000000001' }],
        ]);
        expect(calls.recordKeepaHistoryRefreshFailure.mock.calls).toEqual([
            [{ marketplaceId, asin: 'B000000002', errorMessage: 'no product' }],
        ]);
    });

    it('asks once for first syncs and once for incremental syncs', async () => {
        const { fetchKeepaHistoryBatch } = await loadSubject();
        const days: Record<string, number> = { B000000001: 3650, B000000002: 30, B000000003: 37 };
        const { deps, calls } = createDeps({
            getKeepaHistoryDaysForAsin: mock(async ({ asin }: { asin: string }) => days[asin]),
        });

        await fetchKeepaHistoryBatch({ marketplaceId, asins: Object.keys(days) }, deps);

        expect(calls.loadKeepaHistoryBatch.mock.calls).toEqual([
            [{ marketplaceId, asins: ['B000000001'], days: 3650 }],
            [{ marketplaceId, asins: ['B000000002', 'B000000003'], days: 37 }],
        ]);
    });

    it('drops products that are no longer due before asking Keepa', async () => {
        const { fetchKeepaHistoryBatch } = await loadSubject();
        const { deps, calls } = createDeps({
            shouldKeepaHistoryRefreshAsin: mock(async ({ asin }: { asin: string }) =>
                asin === 'B000000001'
                    ? { shouldRefresh: false as const, reason: 'fresh_product' as const }
                    : { shouldRefresh: true as const, reason: 'stale_product' as const }
            ),
        });

        await fetchKeepaHistoryBatch({ marketplaceId, asins: ['B000000001', 'B000000002'] }, deps);

        expect(calls.loadKeepaHistoryBatch.mock.calls[0][0].asins).toEqual(['B000000002']);
        expect(calls.removeKeepaHistoryRefreshQueueItem.mock.calls[0]).toEqual([
            { marketplaceId, asin: 'B000000001' },
        ]);
    });

    it('keeps deferred work queued at its retry time without recording failures', async () => {
        const { fetchKeepaHistoryBatch } = await loadSubject();
        const retryAt = new Date('2026-10-23T13:00:00Z');
        const { deps, calls } = createDeps({
            loadKeepaHistoryBatch: mock(() =>
                Promise.reject(new KeepaCapacityDeferredError('live-reserve', retryAt))
            ),
        });

        const result = await fetchKeepaHistoryBatch(
            { marketplaceId, asins: ['B000000001', 'B000000002'] },
            deps
        );

        expect(result).toEqual({ synced: 0, failed: 0 });
        expect(calls.deferKeepaHistory.mock.calls).toEqual([
            [{ marketplaceId, asin: 'B000000001', retryAt }],
            [{ marketplaceId, asin: 'B000000002', retryAt }],
        ]);
        expect(calls.recordKeepaHistoryRefreshFailure).not.toHaveBeenCalled();
        expect(calls.createEventLogSafe).not.toHaveBeenCalled();
    });
});

const createDeps = (overrides: Record<string, unknown> = {}) => {
    const calls = {
        deferKeepaHistory: mock(async () => {}),
        createEventLogSafe: mock(async () => {}),
        loadKeepaHistoryBatch: mock(async ({ asins }: { asins: readonly string[] }) =>
            asins.map(asin => ({ asin, status: 'success' as const }))
        ),
        getKeepaHistoryDaysForAsin: mock(async () => 30),
        getKeepaHistoryRefreshQueueItem: mock(async () => ({
            id: 'queue-1',
            marketplaceId,
            asin: 'B000000001',
            attemptCount: 0,
        })),
        recordKeepaHistoryRefreshFailure: mock(async () => ({ failureCount: 1, retryDelayMs: 1 })),
        removeKeepaHistoryRefreshQueueItem: mock(async () => {}),
        shouldKeepaHistoryRefreshAsin: mock(async () => ({
            shouldRefresh: true as const,
            reason: 'stale_product' as const,
        })),
        ...overrides,
    };
    type Deps = NonNullable<
        Parameters<typeof import('./fetch-keepa-history-batch').fetchKeepaHistoryBatch>[1]
    >;
    return { deps: calls as unknown as Deps, calls };
};

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./fetch-keepa-history-batch');
};

const seedRequiredEnvForTests = () => {
    process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN = process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.RANKWRANGLER_SPAPI_CLIENT_ID = process.env.RANKWRANGLER_SPAPI_CLIENT_ID ?? 'test-client';
    process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET = process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.MERCHBASE_CLERK_SECRET_KEY = process.env.MERCHBASE_CLERK_SECRET_KEY ?? 'test-clerk';
    process.env.MERCHBASE_CLERK_PUBLISHABLE_KEY = process.env.MERCHBASE_CLERK_PUBLISHABLE_KEY ?? 'pk_test_rankwrangler';
    process.env.MERCHBASE_CLERK_JWT_KEY = process.env.MERCHBASE_CLERK_JWT_KEY ?? 'test-jwt-key';
    process.env.MERCHBASE_CLERK_ISSUER = process.env.MERCHBASE_CLERK_ISSUER ?? 'https://clerk.test';
    process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES =
        process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES ?? 'https://app.test';
    process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET =
        process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET ?? 'test-webhook-secret';
};
