import type { RouterInputs } from '@/lib/trpc';

export type EventRange = RouterInputs['api']['app']['eventLogHistogram']['range'];

/** The time ranges the event log offers, with the server's bucket width for each. */
export const eventRanges: ReadonlyArray<{
    readonly bucketMs: number;
    readonly buckets: number;
    readonly id: EventRange;
    readonly label: string;
}> = [
    { bucketMs: 60_000, buckets: 60, id: '1h', label: '1h' },
    { bucketMs: 30 * 60_000, buckets: 48, id: '24h', label: '24h' },
    { bucketMs: 3 * 3_600_000, buckets: 56, id: '7d', label: '7d' },
];

/**
 * Where a range's histogram starts: bucket-aligned, ending with the bucket that holds `now`, the
 * way the server lays the buckets out. The event list starts at the same instant, so both show
 * the same events.
 */
export const eventRangeStart = (range: EventRange, now: number) => {
    const { bucketMs, buckets } = eventRanges.find(item => item.id === range) ?? fallback;
    const end = (Math.floor(now / bucketMs) + 1) * bucketMs;
    return new Date(end - buckets * bucketMs).toISOString();
};

/** A bucket's axis label: the clock within a day, the weekday and hour across a week. */
export const formatBucket = (iso: string, range: EventRange) =>
    (range === '7d' ? weekFormatter : clockFormatter).format(new Date(iso));

const fallback = { bucketMs: 30 * 60_000, buckets: 48 };

const clockFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
});

const weekFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
});
