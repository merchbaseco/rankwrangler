import { and, sql } from 'drizzle-orm';
import { eventLogLevels, type EventLogLevel } from '@/services/event-log-enums';
import { type EventLogFilters, eventLogFilterConditions } from '@/services/event-log-filters';
import { db } from './index';
import { eventLogs } from './schema';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Each range's bucket width and count: about an hour of minutes, a day of half hours, a week. */
export const eventLogHistogramRanges = {
    '1h': { bucketMs: MINUTE_MS, buckets: 60 },
    '24h': { bucketMs: 30 * MINUTE_MS, buckets: 48 },
    '7d': { bucketMs: 3 * HOUR_MS, buckets: 56 },
} as const;

export type EventLogHistogramRange = keyof typeof eventLogHistogramRanges;

type LevelCounts = Record<EventLogLevel, number>;

/**
 * Event counts over a time range in fixed buckets, split by level, under the same filters as the
 * event list. Buckets are aligned to their width and end with the one holding `now`, so empty
 * stretches read as zeros rather than gaps. A `since` filter is ignored: the range is the window.
 */
export const readEventLogHistogram = async ({
    accountId,
    filters,
    now = new Date(),
    range,
}: {
    accountId: string;
    filters: EventLogFilters;
    now?: Date;
    range: EventLogHistogramRange;
}) => {
    const { bucketMs, buckets } = eventLogHistogramRanges[range];
    const end = (Math.floor(now.getTime() / bucketMs) + 1) * bucketMs;
    const start = new Date(end - buckets * bucketMs);
    const conditions = eventLogFilterConditions(accountId, {
        ...filters,
        since: start.toISOString(),
    });
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

    const counts = Array.from({ length: buckets }, () => emptyCounts());
    for (const row of rows) {
        const bucket = counts[row.bucket];
        if (bucket && isLevel(row.level)) {
            bucket[row.level] += row.count;
        }
    }
    return {
        range,
        bucketMs,
        buckets: counts.map((levels, index) => ({
            start: new Date(start.getTime() + index * bucketMs).toISOString(),
            ...levels,
        })),
        total: rows.reduce((sum, row) => sum + row.count, 0),
    };
};

const emptyCounts = (): LevelCounts => ({ debug: 0, error: 0, info: 0, warn: 0 });

const isLevel = (value: string): value is EventLogLevel =>
    (eventLogLevels as readonly string[]).includes(value);
