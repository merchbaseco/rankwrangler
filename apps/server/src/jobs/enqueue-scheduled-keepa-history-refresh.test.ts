import { describe, expect, it, mock } from 'bun:test';

type EnqueueScheduledKeepaHistoryRefreshDeps = NonNullable<
    Parameters<
        typeof import('./enqueue-scheduled-keepa-history-refresh.js')['enqueueScheduledKeepaHistoryRefresh']
    >[0]
>;

describe('enqueueScheduledKeepaHistoryRefresh', () => {
    it('persists successful runs even when no candidates are enqueued', async () => {
        const { enqueueScheduledKeepaHistoryRefreshJob } = await loadSubject();

        expect(enqueueScheduledKeepaHistoryRefreshJob.persistSuccess).toBe('always');
        expect(enqueueScheduledKeepaHistoryRefreshJob.sendOptions.singletonKey).toBe(
            'enqueue-scheduled-keepa-history-refresh'
        );
    });

    it('skips when Keepa is not configured', async () => {
        const { enqueueScheduledKeepaHistoryRefresh } = await loadSubject();
        const { deps, calls } = createDeps({ isKeepaConfigured: () => false });

        const result = await enqueueScheduledKeepaHistoryRefresh(deps);

        expect(result).toMatchObject({ didWork: false, reason: 'keepa_not_configured' });
        expect(calls.getKeepaScheduledRefreshCandidates.mock.calls).toHaveLength(0);
        expect(calls.enqueueKeepaScheduledRefreshCandidates.mock.calls).toHaveLength(0);
    });

    it('leaves a queue already at its target alone', async () => {
        const { enqueueScheduledKeepaHistoryRefresh } = await loadSubject();
        const { deps, calls } = createDeps({
            countQueuedKeepaRefreshes: async () => 600,
            getKeepaRefreshQueueTarget: async () => 600,
        });

        const result = await enqueueScheduledKeepaHistoryRefresh(deps);

        expect(result).toEqual({
            didWork: false,
            queuedBefore: 600,
            target: 600,
            dueCount: 0,
            spareCount: 0,
            reason: 'queue_full',
        });
        expect(calls.getKeepaScheduledRefreshCandidates.mock.calls).toHaveLength(0);
    });

    it('fills the room with tier-due work first, then spare refreshes', async () => {
        const { enqueueScheduledKeepaHistoryRefresh } = await loadSubject();
        const due = [candidate('B000000001'), candidate('B000000002')];
        const spare = [candidate('B000000003')];
        const getKeepaScheduledRefreshCandidates = mock(async () => due);
        const getKeepaSpareRefreshCandidates = mock(async () => spare);
        const enqueueKeepaScheduledRefreshCandidates = mock(
            async (items: readonly unknown[]) => items.length
        );
        const { deps } = createDeps({
            countQueuedKeepaRefreshes: async () => 590,
            getKeepaRefreshQueueTarget: async () => 600,
            getKeepaScheduledRefreshCandidates,
            getKeepaSpareRefreshCandidates,
            enqueueKeepaScheduledRefreshCandidates,
        });

        const result = await enqueueScheduledKeepaHistoryRefresh(deps);

        expect(result).toEqual({
            didWork: true,
            queuedBefore: 590,
            target: 600,
            dueCount: 2,
            spareCount: 1,
            reason: 'enqueued',
        });
        expect(getKeepaScheduledRefreshCandidates.mock.calls[0]).toEqual([{ limit: 10 }]);
        expect(getKeepaSpareRefreshCandidates.mock.calls[0]).toEqual([{ limit: 8 }]);
        expect(enqueueKeepaScheduledRefreshCandidates.mock.calls.map(call => call[0])).toEqual([
            due,
            spare,
        ]);
    });

    it('reports no candidates when nothing is due or stale', async () => {
        const { enqueueScheduledKeepaHistoryRefresh } = await loadSubject();
        const { deps, calls } = createDeps();

        const result = await enqueueScheduledKeepaHistoryRefresh(deps);

        expect(result).toMatchObject({ didWork: false, reason: 'no_candidates' });
        expect(calls.enqueueKeepaScheduledRefreshCandidates.mock.calls).toHaveLength(0);
    });
});

const candidate = (asin: string) => ({ marketplaceId: 'ATVPDKIKX0DER', asin });

const createDeps = (overrides: Partial<EnqueueScheduledKeepaHistoryRefreshDeps> = {}) => {
    const calls = {
        createEventLogSafe: mock(async () => {}),
        countQueuedKeepaRefreshes: mock(async () => 0),
        getKeepaRefreshQueueTarget: mock(async () => 600),
        getKeepaScheduledRefreshCandidates: mock(async () => []),
        getKeepaSpareRefreshCandidates: mock(async () => []),
        enqueueKeepaScheduledRefreshCandidates: mock(async () => 0),
        isKeepaConfigured: mock(() => true),
    };

    return {
        deps: {
            ...calls,
            ...overrides,
        } as EnqueueScheduledKeepaHistoryRefreshDeps,
        calls,
    };
};

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./enqueue-scheduled-keepa-history-refresh.js');
};

const seedRequiredEnvForTests = () => {
    process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN = process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.RANKWRANGLER_SPAPI_CLIENT_ID = process.env.RANKWRANGLER_SPAPI_CLIENT_ID ?? 'test-client';
    process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET = process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES =
        process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES ?? 'https://app.test';
    process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET =
        process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET ?? 'test-webhook-secret';
};
