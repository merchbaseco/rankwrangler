import { beforeEach, describe, expect, it } from 'bun:test';
import { readEventLogHistogram } from '@/db/event-log-histogram';
import { db } from '@/db/index';
import { eventLogs } from '@/db/schema';
import { listEventLogs } from '@/services/event-logs';

const NOW = new Date('2026-08-15T12:07:30.000Z');
const MINUTE_MS = 60 * 1000;
const ACCOUNT = 'histogram-test';

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('event log histogram', () => {
    beforeEach(async () => {
        await db.delete(eventLogs);
    });

    it('counts events per bucket and level, ending with the bucket holding now', async () => {
        await insertEvent({ level: 'info', minutesAgo: 0.5 });
        await insertEvent({ level: 'error', minutesAgo: 0.5 });
        await insertEvent({ level: 'info', minutesAgo: 10 });
        await insertEvent({ level: 'warn', minutesAgo: 59 });
        // Outside the hour: before the first bucket.
        await insertEvent({ level: 'info', minutesAgo: 75 });

        const histogram = await readEventLogHistogram({
            accountId: ACCOUNT,
            filters: {},
            now: NOW,
            range: '1h',
        });

        expect(histogram.buckets).toHaveLength(60);
        expect(histogram.buckets[0]?.start).toBe('2026-08-15T11:08:00.000Z');
        expect(histogram.buckets[59]).toMatchObject({
            error: 1,
            info: 1,
            start: '2026-08-15T12:07:00.000Z',
        });
        expect(histogram.buckets[49]).toMatchObject({
            info: 1,
            start: '2026-08-15T11:57:00.000Z',
        });
        expect(histogram.buckets[0]).toMatchObject({ warn: 1 });
        expect(histogram.total).toBe(4);
    });

    it('honours the event list filters, and the list honours its time range', async () => {
        await insertEvent({ level: 'error', message: 'Keepa refused the call', minutesAgo: 5 });
        await insertEvent({ level: 'info', message: 'Keepa answered', minutesAgo: 5 });
        await insertEvent({ level: 'error', message: 'Catalog search failed', minutesAgo: 5 });
        await insertEvent({ level: 'error', message: 'Keepa refused again', minutesAgo: 90 });

        const histogram = await readEventLogHistogram({
            accountId: ACCOUNT,
            filters: { levels: ['error'], search: 'keepa' },
            now: NOW,
            range: '1h',
        });
        expect(histogram.total).toBe(1);

        const list = await listEventLogs({
            accountId: ACCOUNT,
            levels: ['error'],
            search: 'keepa',
            since: new Date(NOW.getTime() - 60 * MINUTE_MS).toISOString(),
        });
        expect(list.items.map(item => item.message)).toEqual(['Keepa refused the call']);
    });
});

const insertEvent = async ({
    level,
    message = 'Something happened',
    minutesAgo,
}: {
    level: 'debug' | 'error' | 'info' | 'warn';
    message?: string;
    minutesAgo: number;
}) => {
    await db.insert(eventLogs).values({
        accountId: ACCOUNT,
        action: 'test.event',
        category: 'test',
        detailsJson: {},
        level,
        message,
        occurredAt: new Date(NOW.getTime() - minutesAgo * MINUTE_MS),
        primitiveType: 'job',
        status: level === 'error' ? 'failed' : 'success',
    });
};
