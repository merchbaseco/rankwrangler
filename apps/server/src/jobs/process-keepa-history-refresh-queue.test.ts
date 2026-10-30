import { describe, expect, it, mock } from 'bun:test';
import type { PgBoss } from 'pg-boss';

type ProcessKeepaHistoryRefreshQueueDeps = NonNullable<
    Parameters<
        typeof import('./process-keepa-history-refresh-queue.js')['processKeepaHistoryRefreshQueue']
    >[1]
>;

describe('processKeepaHistoryRefreshQueue', () => {
    it('does not refresh Keepa token state when no queue work is due', async () => {
        const { processKeepaHistoryRefreshQueue } = await loadSubject();
        const { boss, calls, deps } = createContext({
            hasDueKeepaHistoryRefreshQueueItems: () => Promise.resolve(false),
        });

        const result = await processKeepaHistoryRefreshQueue(boss, deps);

        expect(result).toEqual({
            didWork: false,
            batchSize: 0,
            dispatchedCount: 0,
            reason: 'no_due_items',
        });
        expect(calls.getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens.mock.calls).toHaveLength(
            0
        );
        expect(calls.getDueKeepaHistoryRefreshQueueItems.mock.calls).toHaveLength(0);
        expect(calls.holdKeepaHistoryRefreshQueueItems.mock.calls).toHaveLength(0);
        expect(calls.send.mock.calls).toHaveLength(0);
    });

    it('refreshes capacity and dispatches due queue work after the preflight', async () => {
        const { processKeepaHistoryRefreshQueue } = await loadSubject();
        const events: string[] = [];
        const queueItem = createQueueItem();
        const getDueKeepaHistoryRefreshQueueItems = mock(() => {
            events.push('select');
            return Promise.resolve([queueItem]);
        });
        const holdKeepaHistoryRefreshQueueItems = mock(() => {
            events.push('hold');
            return Promise.resolve();
        });
        const { boss, calls, deps } = createContext({
            hasDueKeepaHistoryRefreshQueueItems: () => {
                events.push('preflight');
                return Promise.resolve(true);
            },
            getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens: () => {
                events.push('capacity');
                return Promise.resolve(2);
            },
            getDueKeepaHistoryRefreshQueueItems,
            holdKeepaHistoryRefreshQueueItems,
        });

        const result = await processKeepaHistoryRefreshQueue(boss, deps);

        expect(result).toEqual({
            didWork: true,
            batchSize: 2,
            dispatchedCount: 1,
            reason: 'dispatched',
        });
        expect(events).toEqual(['preflight', 'capacity', 'select', 'hold']);
        expect(getDueKeepaHistoryRefreshQueueItems.mock.calls[0]).toEqual([2]);
        expect(holdKeepaHistoryRefreshQueueItems.mock.calls[0]).toEqual([[queueItem.id]]);
        expect(calls.send.mock.calls[0]).toEqual([
            'fetch-keepa-history-batch',
            { marketplaceId: queueItem.marketplaceId, asins: [queueItem.asin] },
            { retryLimit: 0 },
        ]);
    });

    it('sends due work as Keepa requests of up to 100 products per marketplace', async () => {
        const { processKeepaHistoryRefreshQueue } = await loadSubject();
        const items = Array.from({ length: 250 }, (_, index) => ({
            ...createQueueItem(),
            id: `queue-${index}`,
            asin: `B${String(index).padStart(9, '0')}`,
        }));
        const { boss, calls, deps } = createContext({
            getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens: () => Promise.resolve(250),
            getDueKeepaHistoryRefreshQueueItems: () => Promise.resolve(items),
        });

        const result = await processKeepaHistoryRefreshQueue(boss, deps);

        expect(result.dispatchedCount).toBe(250);
        const sizes = (calls.send.mock.calls as unknown as [string, { asins: string[] }][]).map(
            ([, payload]) => payload.asins.length
        );
        expect(sizes).toEqual([100, 100, 50]);
    });

    it('does not select or dispatch queue work when Keepa has no capacity', async () => {
        const { processKeepaHistoryRefreshQueue } = await loadSubject();
        const { boss, calls, deps } = createContext({
            getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens: () => Promise.resolve(0),
        });

        const result = await processKeepaHistoryRefreshQueue(boss, deps);

        expect(result).toEqual({
            didWork: false,
            batchSize: 0,
            dispatchedCount: 0,
            reason: 'no_tokens',
        });
        expect(calls.getDueKeepaHistoryRefreshQueueItems.mock.calls).toHaveLength(0);
        expect(calls.holdKeepaHistoryRefreshQueueItems.mock.calls).toHaveLength(0);
        expect(calls.send.mock.calls).toHaveLength(0);
    });

    it('handles due work disappearing between preflight and authoritative selection', async () => {
        const { processKeepaHistoryRefreshQueue } = await loadSubject();
        const { boss, calls, deps } = createContext({
            getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens: () => Promise.resolve(2),
            getDueKeepaHistoryRefreshQueueItems: () => Promise.resolve([]),
        });

        const result = await processKeepaHistoryRefreshQueue(boss, deps);

        expect(result).toEqual({
            didWork: false,
            batchSize: 2,
            dispatchedCount: 0,
            reason: 'no_due_items',
        });
        expect(calls.holdKeepaHistoryRefreshQueueItems.mock.calls).toHaveLength(0);
        expect(calls.send.mock.calls).toHaveLength(0);
    });
});

const createContext = (overrides: Partial<ProcessKeepaHistoryRefreshQueueDeps> = {}) => {
    const calls = {
        hasDueKeepaHistoryRefreshQueueItems: mock(() => Promise.resolve(true)),
        getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens: mock(() => Promise.resolve(2)),
        getDueKeepaHistoryRefreshQueueItems: mock(() => Promise.resolve([createQueueItem()])),
        holdKeepaHistoryRefreshQueueItems: mock(() => Promise.resolve()),
        send: mock(() => Promise.resolve(null)),
    };
    const deps = {
        hasDueKeepaHistoryRefreshQueueItems: calls.hasDueKeepaHistoryRefreshQueueItems,
        getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens:
            calls.getKeepaHistoryRefreshQueueBatchSizeWithFreshTokens,
        getDueKeepaHistoryRefreshQueueItems: calls.getDueKeepaHistoryRefreshQueueItems,
        holdKeepaHistoryRefreshQueueItems: calls.holdKeepaHistoryRefreshQueueItems,
        ...overrides,
    } as ProcessKeepaHistoryRefreshQueueDeps;

    return {
        boss: { send: calls.send } as unknown as PgBoss,
        calls,
        deps,
    };
};

const createQueueItem = () => ({
    id: 'queue-1',
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B012345678',
    attemptCount: 0,
    nextAttemptAt: new Date('2026-08-08T12:00:00.000Z'),
    createdAt: new Date('2026-08-08T12:00:00.000Z'),
});

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./process-keepa-history-refresh-queue.js');
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
