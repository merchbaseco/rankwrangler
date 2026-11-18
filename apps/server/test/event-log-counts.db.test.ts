import { beforeEach, describe, expect, it } from 'bun:test';
import { and, sql } from 'drizzle-orm';
import { foldEventLogCounts } from '@/db/event-log-count-fold';
import {
    EVENT_LOG_HISTOGRAM_SCAN_ROWS,
    type EventLogHistogramRange,
    eventLogHistogramRanges,
    readEventLogHistogram,
} from '@/db/event-log-histogram';
import { db } from '@/db/index';
import { eventLogs } from '@/db/schema';
import { pruneEventLogs } from '@/jobs/prune-event-logs';
import type { EventLogFilters } from '@/services/event-log-filters';
import { eventLogIndexedConditions, eventLogScanConditions } from '@/services/event-log-filters';
import { EVENT_LOG_SCAN_ROWS, listEventLogs } from '@/services/event-logs';

const NOW = new Date('2026-08-15T12:07:30.000Z');
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const ACCOUNT = 'global';
const levels = ['info', 'warn', 'error', 'debug'] as const;
const types = ['product', 'history', 'job', 'keyword'] as const;
const statuses = ['success', 'failed', 'pending', 'retrying', 'partial'] as const;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('event log counts', () => {
    beforeEach(async () => {
        await db.execute(sql`delete from event_logs`);
        await db.execute(sql`delete from event_log_counts`);
        await db.execute(sql`delete from event_log_count_state`);
    });

    it('reads the folded counts the same as aggregating every event', async () => {
        await insertVariedEvents();
        const fold = await foldEventLogCounts(NOW);
        expect(fold.steps).toBeGreaterThan(1);
        // Arrives after the fold, newer than its watermark: counted from the raw tail.
        await insertEvent({ minutesAgo: 0.2, level: 'warn', primitiveType: 'job' });
        const filters: EventLogFilters[] = [
            {},
            { primitiveTypes: ['keyword'] },
            { levels: ['error', 'warn'] },
            { statuses: ['failed'] },
            { primitiveTypes: ['product'], levels: ['info'], statuses: ['success'] },
            { search: 'keepa' },
            { levels: ['error'], search: 'refused' },
        ];
        for (const range of Object.keys(eventLogHistogramRanges) as EventLogHistogramRange[]) {
            for (const filter of filters) {
                const read = await readEventLogHistogram({
                    accountId: ACCOUNT,
                    filters: filter,
                    now: NOW,
                    range,
                });
                expect({ range, filter, ...read }).toEqual({
                    range,
                    filter,
                    ...(await referenceHistogram(filter, range)),
                    coveredFrom: null,
                });
            }
        }
    });

    it('recounts late events, drops emptied buckets and folds nothing past the watermark', async () => {
        await insertEvent({ minutesAgo: 30 });
        await foldEventLogCounts(NOW);
        // Committed after the fold, but stamped inside the folded window.
        await insertEvent({ minutesAgo: 5, level: 'error' });
        await db.execute(sql`delete from event_logs where level = 'info'`);
        await foldEventLogCounts(NOW);
        const read = await readEventLogHistogram({
            accountId: ACCOUNT,
            filters: {},
            now: NOW,
            range: '1h',
        });
        expect(read).toEqual({ ...(await referenceHistogram({}, '1h')), coveredFrom: null });
        expect(read.total).toBe(1);
        const [rows] = await db.execute<{ count: number }>(
            sql`select count(*)::int count from event_log_counts where level = 'info'`
        );
        expect(rows?.count).toBe(0);
        const [state] = await db.execute<{ through: string }>(
            sql`select folded_through::text through from event_log_count_state`
        );
        expect(state?.through).toBe('2026-08-15 12:07:00');
    });

    it('counts at most the raw-event bound and says where counting started', async () => {
        await db.execute(sql`
            insert into event_logs (account_id, occurred_at, level, status, category, action,
                primitive_type, message, details_json)
            select ${ACCOUNT}, ${NOW.toISOString()}::timestamp - (n * interval '1 second'),
                'info', 'success', 'test', 'test.event', 'job', 'Keepa answered', '{}'::jsonb
            from generate_series(1, ${EVENT_LOG_HISTOGRAM_SCAN_ROWS + 10}) n`);
        const read = await readEventLogHistogram({
            accountId: ACCOUNT,
            filters: { search: 'keepa' },
            now: NOW,
            range: '24h',
        });
        expect(read.total).toBe(EVENT_LOG_HISTOGRAM_SCAN_ROWS);
        expect(read.coveredFrom).toBe(
            new Date(NOW.getTime() - EVENT_LOG_HISTOGRAM_SCAN_ROWS * 1000).toISOString()
        );
    });

    it('pages a rare match through bounded scans and keeps dense pages unchanged', async () => {
        await insertEvent({ minutesAgo: 2 * 24 * 60, level: 'error', message: 'Old failure' });
        await db.execute(sql`
            insert into event_logs (account_id, occurred_at, level, status, category, action,
                primitive_type, message, details_json)
            select ${ACCOUNT}, ${NOW.toISOString()}::timestamp - (n * interval '1 second'),
                'info', 'success', 'test', 'test.event', 'job', 'Routine', '{}'::jsonb
            from generate_series(1, ${EVENT_LOG_SCAN_ROWS + 5}) n`);
        const first = await listEventLogs({ accountId: ACCOUNT, levels: ['error'], limit: 50 });
        expect(first.items).toEqual([]);
        expect(first.nextCursor).not.toBeNull();
        const second = await listEventLogs({
            accountId: ACCOUNT,
            levels: ['error'],
            limit: 50,
            cursor: first.nextCursor ?? undefined,
        });
        expect(second.items.map(item => item.message)).toEqual(['Old failure']);
        expect(second.nextCursor).toBeNull();

        for (const filter of [{}, { levels: ['info' as const] }, { search: 'routine' }]) {
            const page = await listEventLogs({ accountId: ACCOUNT, limit: 100, ...filter });
            const reference = await referenceList(filter, 100);
            expect(page.items.map(item => item.id)).toEqual(reference.map(row => row.id));
            expect(page.nextCursor?.id).toBe(reference[99]?.id);
        }
    });

    it('prunes events and folded counts older than thirty days', async () => {
        await insertEvent({ minutesAgo: 31 * 24 * 60 });
        await insertEvent({ minutesAgo: 29 * 24 * 60 });
        await db.execute(sql`
            insert into event_log_counts values
                (${ACCOUNT}, 1, ${new Date(NOW.getTime() - 31 * DAY_MS).toISOString()}::timestamp,
                    'job', 'info', 'success', 1),
                (${ACCOUNT}, 1, ${new Date(NOW.getTime() - 29 * DAY_MS).toISOString()}::timestamp,
                    'job', 'info', 'success', 1)`);
        const result = await pruneEventLogs({ now: () => NOW });
        expect(result).toEqual({
            didWork: true,
            deletedCount: 1,
            countsDeleted: 1,
            reachedDeleteLimit: false,
        });
        const [left] = await db.execute<{ events: number; counts: number }>(sql`
            select (select count(*) from event_logs)::int events,
                (select count(*) from event_log_counts)::int counts`);
        expect(left).toEqual({ events: 1, counts: 1 });
    });
});

/** The histogram statement before the folded counts: every event in the range, aggregated. */
const referenceHistogram = async (filters: EventLogFilters, range: EventLogHistogramRange) => {
    const { bucketMs, buckets } = eventLogHistogramRanges[range];
    const end = (Math.floor(NOW.getTime() / bucketMs) + 1) * bucketMs;
    const start = new Date(end - buckets * bucketMs);
    const conditions = [
        ...eventLogIndexedConditions(ACCOUNT, { ...filters, since: start.toISOString() }),
        ...eventLogScanConditions(filters),
    ];
    const startsAt = sql`${start.toISOString()}::timestamp`;
    const offsetMs = sql`extract(epoch from ${eventLogs.occurredAt} - ${startsAt}) * 1000`;
    const rows = await db
        .select({
            bucket: sql<number>`floor(${offsetMs} / ${bucketMs})::int`,
            level: eventLogs.level,
            count: sql<number>`count(*)::int`,
        })
        .from(eventLogs)
        .where(and(...conditions))
        .groupBy(sql`1`, eventLogs.level);
    const counts = Array.from({ length: buckets }, () => ({
        debug: 0,
        error: 0,
        info: 0,
        warn: 0,
    }));
    for (const row of rows) {
        const bucket = counts[row.bucket];
        if (bucket) bucket[row.level as keyof typeof bucket] += row.count;
    }
    return {
        range,
        bucketMs,
        buckets: counts.map((levelCounts, index) => ({
            start: new Date(start.getTime() + index * bucketMs).toISOString(),
            ...levelCounts,
        })),
        total: rows.reduce((sum, row) => sum + row.count, 0),
    };
};

/** The list statement before the scan bound: walk newest first, filter, take a page. */
const referenceList = async (filters: EventLogFilters, limit: number) =>
    db
        .select({ id: eventLogs.id })
        .from(eventLogs)
        .where(
            and(...eventLogIndexedConditions(ACCOUNT, filters), ...eventLogScanConditions(filters))
        )
        .orderBy(sql`${eventLogs.occurredAt} desc, ${eventLogs.id} desc`)
        .limit(limit);

/** Events across eight days and another account, varied in every folded dimension. */
const insertVariedEvents = async () => {
    const rows = Array.from({ length: 600 }, (_, index) => {
        const level = levels[index % levels.length];
        return {
            accountId: index % 7 === 0 ? 'other-account' : ACCOUNT,
            action: 'test.event',
            category: 'test',
            detailsJson: {},
            level,
            message: index % 5 === 0 ? 'Keepa refused the call' : 'Catalog answered',
            occurredAt: new Date(NOW.getTime() - ((index * 1_913) % (8 * 24 * 60)) * MINUTE_MS),
            primitiveType: types[(index * 3) % types.length],
            status: statuses[(index * 7) % statuses.length],
        };
    });
    await db.insert(eventLogs).values(rows);
};

const insertEvent = async ({
    level = 'info',
    message = 'Something happened',
    minutesAgo,
    primitiveType = 'job',
}: {
    level?: (typeof levels)[number];
    message?: string;
    minutesAgo: number;
    primitiveType?: (typeof types)[number];
}) => {
    await db.insert(eventLogs).values({
        accountId: ACCOUNT,
        action: 'test.event',
        category: 'test',
        detailsJson: {},
        level,
        message,
        occurredAt: new Date(NOW.getTime() - minutesAgo * MINUTE_MS),
        primitiveType,
        status: level === 'error' ? 'failed' : 'success',
    });
};
