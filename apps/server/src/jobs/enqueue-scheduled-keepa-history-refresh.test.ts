import { describe, expect, it, mock } from 'bun:test';

type EnqueueScheduledKeepaHistoryRefreshDeps = NonNullable<
    Parameters<
        (typeof import('./enqueue-scheduled-keepa-history-refresh.js'))['enqueueScheduledKeepaHistoryRefresh']
    >[0]
>;

describe('enqueueScheduledKeepaHistoryRefresh', () => {
    it('skips when Keepa is not configured', async () => {
        const { enqueueScheduledKeepaHistoryRefresh } = await loadSubject();
        const { deps, calls } = createDeps({
            isKeepaConfigured: () => false,
        });

        const result = await enqueueScheduledKeepaHistoryRefresh(deps);

        expect(result).toEqual({
            didWork: false,
            candidateCount: 0,
            enqueuedCount: 0,
            reason: 'keepa_not_configured',
        });
        expect(calls.getKeepaScheduledRefreshCandidates.mock.calls).toHaveLength(0);
        expect(calls.enqueueKeepaScheduledRefreshCandidates.mock.calls).toHaveLength(0);
    });

    it('returns no_candidates when scan finds no stale products', async () => {
        const { enqueueScheduledKeepaHistoryRefresh } = await loadSubject();
        const { deps, calls } = createDeps({
            getKeepaScheduledRefreshCandidates: async () => [],
        });

        const result = await enqueueScheduledKeepaHistoryRefresh(deps);

        expect(result).toEqual({
            didWork: false,
            candidateCount: 0,
            enqueuedCount: 0,
            reason: 'no_candidates',
        });
        expect(calls.enqueueKeepaScheduledRefreshCandidates.mock.calls).toHaveLength(0);
    });

    it('enqueues stale candidates when found', async () => {
        const { enqueueScheduledKeepaHistoryRefresh } = await loadSubject();
        const candidates = [
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B000000001',
            },
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B000000002',
            },
        ];
        const enqueueKeepaScheduledRefreshCandidates = mock(async () => candidates.length);
        const { deps, calls } = createDeps({
            getKeepaScheduledRefreshCandidates: async () => candidates,
            enqueueKeepaScheduledRefreshCandidates,
        });

        const result = await enqueueScheduledKeepaHistoryRefresh(deps);

        expect(result).toEqual({
            didWork: true,
            candidateCount: 2,
            enqueuedCount: 2,
            reason: 'enqueued',
        });
        expect(enqueueKeepaScheduledRefreshCandidates.mock.calls).toHaveLength(1);
        expect(enqueueKeepaScheduledRefreshCandidates.mock.calls[0][0]).toEqual(candidates);
    });

    it('returns already_queued when all candidates already exist in queue', async () => {
        const { enqueueScheduledKeepaHistoryRefresh } = await loadSubject();
        const candidates = [
            {
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B000000001',
            },
        ];
        const { deps } = createDeps({
            getKeepaScheduledRefreshCandidates: async () => candidates,
            enqueueKeepaScheduledRefreshCandidates: async () => 0,
        });

        const result = await enqueueScheduledKeepaHistoryRefresh(deps);

        expect(result).toEqual({
            didWork: false,
            candidateCount: 1,
            enqueuedCount: 0,
            reason: 'already_queued',
        });
    });
});

const createDeps = (overrides: Partial<EnqueueScheduledKeepaHistoryRefreshDeps> = {}) => {
    const calls = {
        createEventLogSafe: mock(async () => {}),
        getKeepaScheduledRefreshCandidates: mock(async () => []),
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
    process.env.SPAPI_REFRESH_TOKEN = process.env.SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.SPAPI_CLIENT_ID = process.env.SPAPI_CLIENT_ID ?? 'test-client';
    process.env.SPAPI_APP_CLIENT_SECRET = process.env.SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.LICENSE_SECRET =
        process.env.LICENSE_SECRET ?? '12345678901234567890123456789012';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
};
