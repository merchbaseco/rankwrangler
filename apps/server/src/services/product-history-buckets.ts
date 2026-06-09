export const productHistoryBuckets = ['auto', 'day', 'week', 'month'] as const;

export type ProductHistoryBucket = (typeof productHistoryBuckets)[number];
export type ResolvedHistoryBucket = Exclude<ProductHistoryBucket, 'auto'>;
export type HistoryBucketTuple = [string, number | null];

export type HistoryBucketSummary = {
    first: number | null;
    latest: number | null;
    min: number | null;
    max: number | null;
    count: number;
    firstBucketAt: string | null;
    latestBucketAt: string | null;
};

type HistoryPoint = {
    observedAt: string;
    value: number | null;
    isMissing: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_DAY_BUCKET_MAX_DAYS = 45;
const AUTO_WEEK_BUCKET_MAX_DAYS = 548;
const emptySummary: HistoryBucketSummary = {
    first: null,
    latest: null,
    min: null,
    max: null,
    count: 0,
    firstBucketAt: null,
    latestBucketAt: null,
};

export const resolveAgentHistoryWindow = ({
    startAt,
    endAt,
    days,
    now = new Date(),
}: {
    startAt?: Date;
    endAt?: Date;
    days: number;
    now?: Date;
}) => {
    const resolvedEndAt = endAt ?? now;
    const resolvedStartAt = startAt ?? new Date(resolvedEndAt.getTime() - days * DAY_MS);

    return {
        startAt: resolvedStartAt,
        endAt: resolvedEndAt,
    };
};

export const buildHistoryBuckets = ({
    points,
    bucket,
    startAt,
    endAt,
}: {
    points: HistoryPoint[];
    bucket: ResolvedHistoryBucket;
    startAt: Date;
    endAt: Date;
}): HistoryBucketTuple[] => {
    const startMs = startAt.getTime();
    const endMs = endAt.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
        return [];
    }

    const sortedPoints = points
        .filter(point => point.isMissing || typeof point.value === 'number')
        .map(point => ({
            observedMs: Date.parse(point.observedAt),
            value: point.isMissing ? null : (point.value as number),
        }))
        .filter(point => Number.isFinite(point.observedMs))
        .sort((left, right) => left.observedMs - right.observedMs);

    if (sortedPoints.length === 0) {
        return [];
    }

    let pointIndex = 0;
    let hasValue = false;
    let currentValue: number | null = null;
    while (pointIndex < sortedPoints.length && sortedPoints[pointIndex].observedMs <= startMs) {
        currentValue = sortedPoints[pointIndex].value;
        hasValue = true;
        pointIndex += 1;
    }

    const buckets: HistoryBucketTuple[] = [];
    for (
        let bucketStartMs = getBucketStartMs(startMs, bucket);
        bucketStartMs <= endMs;
        bucketStartMs = getNextBucketStartMs(bucketStartMs, bucket)
    ) {
        const bucketEndMs = Math.min(getNextBucketStartMs(bucketStartMs, bucket) - 1, endMs);
        while (
            pointIndex < sortedPoints.length &&
            sortedPoints[pointIndex].observedMs <= bucketEndMs
        ) {
            currentValue = sortedPoints[pointIndex].value;
            hasValue = true;
            pointIndex += 1;
        }

        if (hasValue) {
            buckets.push([formatDate(new Date(Math.max(bucketStartMs, startMs))), currentValue]);
        }
    }

    return buckets;
};

export const resolveHistoryBucket = ({
    requestedBucket,
    startAt,
    endAt,
}: {
    requestedBucket: ProductHistoryBucket;
    startAt: Date;
    endAt: Date;
}): ResolvedHistoryBucket => {
    if (requestedBucket !== 'auto') {
        return requestedBucket;
    }

    const spanDays = Math.ceil(Math.abs(endAt.getTime() - startAt.getTime()) / DAY_MS);
    if (spanDays <= AUTO_DAY_BUCKET_MAX_DAYS) {
        return 'day';
    }

    if (spanDays <= AUTO_WEEK_BUCKET_MAX_DAYS) {
        return 'week';
    }

    return 'month';
};

export const summarizeBuckets = (buckets: HistoryBucketTuple[]): HistoryBucketSummary => {
    if (buckets.length === 0) {
        return emptySummary;
    }

    const values = buckets.map(([_, value]) => value).filter(value => typeof value === 'number');
    return {
        first: buckets[0][1],
        latest: buckets.at(-1)?.[1] ?? null,
        min: values.length > 0 ? Math.min(...values) : null,
        max: values.length > 0 ? Math.max(...values) : null,
        count: buckets.length,
        firstBucketAt: buckets[0][0],
        latestBucketAt: buckets.at(-1)?.[0] ?? null,
    };
};

const getBucketStartMs = (timeMs: number, bucket: ResolvedHistoryBucket) => {
    const date = new Date(timeMs);
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    if (bucket === 'week') {
        start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    } else if (bucket === 'month') {
        start.setUTCDate(1);
    }

    return start.getTime();
};

const getNextBucketStartMs = (bucketStartMs: number, bucket: ResolvedHistoryBucket) => {
    const next = new Date(bucketStartMs);
    if (bucket === 'day') {
        next.setUTCDate(next.getUTCDate() + 1);
    } else if (bucket === 'week') {
        next.setUTCDate(next.getUTCDate() + 7);
    } else {
        next.setUTCMonth(next.getUTCMonth() + 1);
    }

    return next.getTime();
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);
