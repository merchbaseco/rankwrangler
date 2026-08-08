import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import type { Context } from '@/api/context.js';
import { router } from '@/api/trpc.js';
import type { TopSearchTermsDatasetRecord } from '@/db/top-search-terms/dataset-record.js';
import type { TopSearchTermsSnapshotRecord } from '@/db/top-search-terms/snapshots.js';
import {
    getKeywordIntelligence,
    type KeywordDependencies,
    searchKeywordIntelligence,
} from '@/services/keyword-intelligence.js';
import { createKeywordGetProcedure } from './keyword-get.js';
import { createKeywordSearchProcedure } from './keyword-search.js';

describe('public keyword retrieval contract', () => {
    it('returns policy-current data immediately without scheduling work', async () => {
        const fixture = createFixture({ snapshot: createSnapshot() });
        const result = await fixture.caller.get({ keyword: 'Garden Shirt' });

        expect(result.status).toBe('ready');
        expect(result).not.toHaveProperty('freshness');
        expect(fixture.sendTriggers).toEqual([]);
    });

    it('waits for policy-expired data before returning the final snapshot', async () => {
        const fixture = createFixture({
            snapshot: createSnapshot('2026-08-04T12:00:00.000Z'),
        });
        const result = await fixture.caller.get({ keyword: 'garden shirt' });

        expect(result.status).toBe('ready');
        expect(result).not.toHaveProperty('freshness');
        expect(fixture.sendTriggers).toEqual(['requested']);
    });

    it('waits for first-time data', async () => {
        const firstTime = createFixture({ snapshot: null });
        const firstResult = await firstTime.caller.get({ keyword: 'garden shirt' });

        expect(firstResult).not.toHaveProperty('freshness');
        expect(firstTime.sendTriggers).toEqual(['requested']);
    });

    it('coalesces canonical equivalent work by keyword category', async () => {
        let release!: () => void;
        const fixture = createFixture({ snapshot: null });
        let job: Promise<void> | null = null;
        const sendFetchJob = mock(async ({ trigger }: { trigger: 'requested' | 'automatic' }) => {
            fixture.sendTriggers.push(trigger);
            job ??= new Promise<void>(resolve => {
                release = resolve;
            });
            await job;
            fixture.snapshot = createSnapshot();
            return 'job-id';
        });
        fixture.dependencies.sendFetchJob = sendFetchJob as KeywordDependencies['sendFetchJob'];

        const first = fixture.caller.get({ keyword: 'Garden  Shirt' });
        await waitForMicrotasks();
        const second = fixture.caller.search({ text: ' garden shirt ' });
        await waitForMicrotasks();

        expect(fixture.sendTriggers).toEqual(['requested']);
        release();
        await Promise.all([first, second]);
        expect(fixture.sendTriggers).toHaveLength(1);
    });

    it('observes a failed dataset cooldown without enqueueing another job', async () => {
        const fixture = createFixture({
            dataset: {
                ...createDataset('failed'),
                nextRefreshAt: '2026-08-06T13:00:00.000Z',
            },
            snapshot: null,
        });
        const error = await fixture.caller.get({ keyword: 'garden shirt' }).catch(reason => reason);

        expect(error).toMatchObject({
            code: 'TIMEOUT',
            message: 'Keyword performance is temporarily unavailable. Retry after 3600 seconds.',
        });
        expect(fixture.sendTriggers).toEqual([]);
    });

    it('does not enqueue duplicate work when a caller retries an active job', async () => {
        let nowMs = Date.parse('2026-08-06T12:00:00.000Z');
        const fixture = createFixture({
            snapshot: null,
            dataset: createDataset('queued'),
        });
        fixture.dependencies.now = () => {
            nowMs += 100;
            return new Date(nowMs);
        };
        fixture.dependencies.workTimeoutMs = 1;

        const firstError = await fixture.caller
            .get({ keyword: 'garden shirt' })
            .catch(error => error);
        const secondError = await fixture.caller
            .get({ keyword: 'garden shirt' })
            .catch(error => error);

        expect(firstError).toBeInstanceOf(TRPCError);
        expect(secondError).toBeInstanceOf(TRPCError);
        expect(fixture.sendTriggers).toEqual([]);
    });
});

const createFixture = ({
    dataset = createDataset('completed'),
    snapshot,
}: {
    dataset?: TopSearchTermsDatasetRecord;
    snapshot: TopSearchTermsSnapshotRecord | null;
}) => {
    const state = {
        dataset,
        snapshot,
    };
    const sendTriggers: Array<'requested' | 'automatic'> = [];
    const sendFetchJob = mock(({ trigger }: { trigger: 'requested' | 'automatic' }) => {
        sendTriggers.push(trigger);
        state.snapshot = createSnapshot();
        return Promise.resolve('job-id');
    });
    const dependencies = {
        ensureDataset: mock(() => Promise.resolve(state.dataset ?? createDataset('idle'))),
        getDatasetById: mock(() => Promise.resolve(state.dataset)),
        getLatestSnapshot: mock(() => Promise.resolve(state.snapshot)),
        sendFetchJob: sendFetchJob as KeywordDependencies['sendFetchJob'],
        setDatasetQueued: mock(() => Promise.resolve(state.dataset)),
        sleep: () => Promise.resolve(),
        now: () => new Date('2026-08-06T12:00:00.000Z'),
        workTimeoutMs: 100,
        getLatestDataset: mock(() => Promise.resolve(state.dataset)),
        getDatasetByWindow: mock(() => Promise.resolve(state.dataset)),
        getKeyword: mock(() =>
            Promise.resolve({
                searchTerm: 'garden shirt',
                searchFrequencyRank: 42,
                clickShareTop3Sum: 0.2,
                conversionShareTop3Sum: 0.03,
                topRowsCount: 1,
                isMerchRelevant: true,
                merchReason: 'explicit merch intent',
            })
        ),
        listKeywords: mock(() =>
            Promise.resolve({ items: [], nextCursor: null, totalFiltered: 0 })
        ),
        getTrend: mock(() => Promise.resolve({ latestObservedDate: null, points: [] })),
    } satisfies KeywordDependencies;
    const usage = mock(async () => undefined);
    const caller = router({
        get: createKeywordGetProcedure({
            getKeywordIntelligence: input => getKeywordIntelligence(input, dependencies),
            consumeServiceAccountUsageForRequest: usage,
        }),
        search: createKeywordSearchProcedure({
            searchKeywordIntelligence: input => searchKeywordIntelligence(input, dependencies),
            consumeServiceAccountUsageForRequest: usage,
        }),
    }).createCaller(createPublicContext());

    return {
        caller,
        dependencies,
        sendTriggers,
        get snapshot() {
            return state.snapshot;
        },
        set snapshot(value: TopSearchTermsSnapshotRecord | null) {
            state.snapshot = value;
        },
    };
};

const createDataset = (
    status: TopSearchTermsDatasetRecord['status'],
    overrides: Partial<TopSearchTermsDatasetRecord> = {}
): TopSearchTermsDatasetRecord => ({
    id: '11111111-1111-4111-8111-111111111111',
    marketplaceId: 'ATVPDKIKX0DER',
    reportPeriod: 'DAY',
    dataStartDate: '2026-08-06',
    dataEndDate: '2026-08-06',
    status,
    refreshing: status === 'queued' || status === 'in_progress',
    activeJobId: status === 'queued' ? 'job-id' : null,
    activeJobRequestedAt: null,
    fetchStartedAt: null,
    lastCompletedAt: status === 'completed' ? '2026-08-06T12:00:00.000Z' : null,
    lastFailedAt: null,
    lastError: null,
    reportId: null,
    refreshTrigger: 'automatic',
    nextRefreshAt: null,
    createdAt: '2026-08-06T12:00:00.000Z',
    updatedAt: '2026-08-06T12:00:00.000Z',
    ...overrides,
});

const createSnapshot = (fetchedAt = '2026-08-06T12:00:00.000Z'): TopSearchTermsSnapshotRecord => ({
    id: '22222222-2222-4222-8222-222222222222',
    datasetId: '11111111-1111-4111-8111-111111111111',
    marketplaceId: 'ATVPDKIKX0DER',
    reportPeriod: 'DAY',
    dataStartDate: '2026-08-06',
    dataEndDate: '2026-08-06',
    observedDate: '2026-08-06',
    reportId: 'report-id',
    sourceJobId: 'job-id',
    trigger: 'requested',
    keywordCount: 1,
    fetchedAt,
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
});

const waitForMicrotasks = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
};

const createPublicContext = () =>
    ({
        user: { sub: 'mbu_test' },
        isAdmin: false,
        authType: 'access',
        credentialKind: 'api_key',
        authExpiresAtMs: null,
        accessPrincipal: {
            id: '11111111-1111-4111-8111-111111111111',
            service: 'rankwrangler',
            merchbaseUserId: 'mbu_test',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastUsedAt: null,
            usageToday: 0,
            usageCount: 0,
            usageLimit: 100,
            lastResetAt: new Date(),
        },
        accessError: null,
        request: { headers: {} },
    }) as Context;
