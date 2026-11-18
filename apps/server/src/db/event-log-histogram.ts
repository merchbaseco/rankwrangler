import { and, type SQL, sql } from 'drizzle-orm';
import { type EventLogLevel, eventLogLevels } from '@/services/event-log-enums';
import {
    type EventLogFilters,
    eventLogIndexedConditions,
    eventLogScanConditions,
} from '@/services/event-log-filters';
import { db } from './index';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Each range's bucket width and count: about an hour of minutes, a day of half hours, a week. */
export const eventLogHistogramRanges = {
    '1h': { bucketMs: MINUTE_MS, buckets: 60, foldMinutes: 1 },
    '24h': { bucketMs: 30 * MINUTE_MS, buckets: 48, foldMinutes: 30 },
    '7d': { bucketMs: 3 * HOUR_MS, buckets: 56, foldMinutes: 30 },
} as const;

/** Raw events a histogram counts at most; past it, the counts start at `coveredFrom`. */
export const EVENT_LOG_HISTOGRAM_SCAN_ROWS = 50_000;

export type EventLogHistogramRange = keyof typeof eventLogHistogramRanges;

type LevelCounts = Record<EventLogLevel, number>;

/**
 * Event counts over a time range in fixed buckets, split by level, under the same filters as the
 * event list. Buckets are aligned to their width and end with the one holding `now`, so empty
 * stretches read as zeros rather than gaps. A `since` filter is ignored: the range is the window.
 *
 * Type, level and status filters read the folded `event_log_counts` up to where the fold has
 * counted, then the few raw events after it. Filters the counts do not carry (text, action,
 * ASIN, marketplace, job run) count raw events. Either way at most
 * EVENT_LOG_HISTOGRAM_SCAN_ROWS raw events are read, newest first; when that bound cuts the read
 * short, `coveredFrom` is the oldest raw event counted and events before it may be missing from
 * the counts (null when every event in the range is counted).
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
    const { bucketMs, buckets, foldMinutes } = eventLogHistogramRanges[range];
    const end = (Math.floor(now.getTime() / bucketMs) + 1) * bucketMs;
    const start = new Date(end - buckets * bucketMs);
    const startsAt = sql`${start.toISOString()}::timestamp`;
    const endsAt = sql`${new Date(end).toISOString()}::timestamp`;
    const { since: _since, ...rangeFilters } = filters;
    const folded = canFold(rangeFilters);
    const bucketOf = (at: SQL) =>
        sql`floor(extract(epoch from ${at} - ${startsAt}) * 1000 / ${sql.raw(String(bucketMs))})::int`;
    // Where the folded counts stop: the fold's watermark, floored to whole fold buckets and kept
    // inside the range; the range start when nothing applies, so every event is counted raw.
    const rawFrom = folded
        ? sql`(select least(greatest(coalesce(date_bin(${sql.raw(`'${foldMinutes} minutes'`)},
              folded_through, timestamp '2000-01-01'), ${startsAt}), ${startsAt}), ${endsAt})
              from (select 1) one left join event_log_count_state on id = 1)`
        : startsAt;
    const raw = and(
        ...eventLogIndexedConditions(accountId, rangeFilters),
        sql`occurred_at >= ${rawFrom}`,
        sql`occurred_at < ${endsAt}`
    );
    const scan = eventLogScanConditions(rangeFilters);
    const rows = await db.execute<{
        bucket: number | null;
        level: string | null;
        count: number | null;
        tail_rows: number | null;
        tail_from_ms: number | null;
    }>(sql`
        with tail as materialized (
            select occurred_at, level, (${scan.length ? and(...scan) : sql`true`}) matches
            from event_logs where ${raw}
            order by occurred_at desc limit ${EVENT_LOG_HISTOGRAM_SCAN_ROWS}
        ),
        counted as (
            ${
                folded
                    ? sql`select ${bucketOf(sql`bucket_start`)} bucket, level, count
                from event_log_counts
                where ${and(...foldedConditions(accountId, rangeFilters, foldMinutes))}
                    and bucket_start >= ${startsAt} and bucket_start < ${rawFrom}
            union all`
                    : sql``
            }
            select ${bucketOf(sql`occurred_at`)} bucket, level, 1 count from tail where matches
        )
        select bucket, level, sum(count)::int count, null::int tail_rows, null::float8 tail_from_ms
        from counted group by bucket, level
        union all
        select null, null, null, (select count(*) from tail)::int,
            (select extract(epoch from min(occurred_at)) * 1000 from tail)::float8`);

    const counts = Array.from({ length: buckets }, () => emptyCounts());
    let total = 0;
    let coveredFrom: string | null = null;
    for (const row of rows) {
        if (row.tail_rows !== null) {
            if (row.tail_rows >= EVENT_LOG_HISTOGRAM_SCAN_ROWS && row.tail_from_ms !== null) {
                coveredFrom = new Date(Number(row.tail_from_ms)).toISOString();
            }
            continue;
        }
        const bucket = row.bucket === null ? undefined : counts[row.bucket];
        if (bucket && row.level && isLevel(row.level)) {
            bucket[row.level] += Number(row.count);
            total += Number(row.count);
        }
    }
    return {
        range,
        bucketMs,
        buckets: counts.map((levels, index) => ({
            start: new Date(start.getTime() + index * bucketMs).toISOString(),
            ...levels,
        })),
        total,
        coveredFrom,
    };
};

/** The folded counts carry type, level and status; any other filter needs raw events. */
const canFold = (filters: EventLogFilters) =>
    !filters.search &&
    !filters.actions?.length &&
    !filters.asin &&
    !filters.marketplaceId &&
    !filters.jobRunId;

const foldedConditions = (accountId: string, filters: EventLogFilters, foldMinutes: number) => {
    const conditions: SQL[] = [
        sql`account_id = ${accountId}`,
        sql`bucket_minutes = ${foldMinutes}`,
    ];
    if (filters.primitiveTypes?.length) {
        conditions.push(sql`primitive_type in ${filters.primitiveTypes}`);
    }
    if (filters.levels?.length) conditions.push(sql`level in ${filters.levels}`);
    if (filters.statuses?.length) conditions.push(sql`status in ${filters.statuses}`);
    return conditions;
};

const emptyCounts = (): LevelCounts => ({ debug: 0, error: 0, info: 0, warn: 0 });

const isLevel = (value: string): value is EventLogLevel =>
    (eventLogLevels as readonly string[]).includes(value);
