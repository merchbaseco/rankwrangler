/**
 * Keepa history as stored: one series per Product, source, metric and category, kept the way Keepa
 * delivers it — Keepa minutes ascending, and the integer value at each. A negative value is
 * Keepa's missing marker (no offer, no rank) and decodes to `valueInt: null, isMissing: true`.
 *
 * Every writer builds series and every reader decodes them through this module, so the encoding
 * has one owner. It is env-free, so the normalizer, the development seed and the tests share it.
 */

const KEEPA_MINUTE_EPOCH_OFFSET = 21_564_000;
const MINUTE_MS = 60_000;

/** The value stored for a point Keepa (or an older store) marked as missing. */
export const KEEPA_MISSING_VALUE = -1;

export type KeepaHistorySeries = {
    readonly metric: string;
    readonly categoryId: number;
    /** Strictly ascending Keepa minutes. */
    readonly keepaMinutes: readonly number[];
    /** One value per minute: rank, or price in minor units; negative means missing. */
    readonly values: readonly number[];
};

export type KeepaHistoryPoint = {
    readonly metric: string;
    readonly categoryId: number;
    readonly observedAt: Date;
    readonly keepaMinutes: number;
    readonly valueInt: number | null;
    readonly isMissing: boolean;
};

/** Converts an instant to the nearest Keepa minute, for writers without a Keepa payload. */
export const dateToKeepaMinute = (date: Date) =>
    Math.round(date.getTime() / MINUTE_MS) - KEEPA_MINUTE_EPOCH_OFFSET;

export const keepaMinuteToDate = (keepaMinutes: number) =>
    new Date((keepaMinutes + KEEPA_MINUTE_EPOCH_OFFSET) * MINUTE_MS);

/** The latest Keepa minute observed by `date`: a point is in force then iff its minute is <= this. */
export const lastKeepaMinuteAt = (date: Date) =>
    Math.floor(date.getTime() / MINUTE_MS) - KEEPA_MINUTE_EPOCH_OFFSET;

/**
 * Builds a series from `[keepaMinutes, value]` pairs in any order. A repeated minute keeps its
 * last value; non-finite pairs are dropped. Returns null when nothing remains.
 */
export const buildKeepaHistorySeries = (
    metric: string,
    categoryId: number,
    pairs: Iterable<readonly [number, number]>
): KeepaHistorySeries | null => {
    const byMinute = new Map<number, number>();
    for (const [keepaMinutes, value] of pairs) {
        if (Number.isFinite(keepaMinutes) && Number.isFinite(value)) {
            byMinute.set(keepaMinutes, value);
        }
    }
    if (byMinute.size === 0) return null;

    const keepaMinutes = [...byMinute.keys()].sort((left, right) => left - right);
    return {
        metric,
        categoryId,
        keepaMinutes,
        values: keepaMinutes.map(minute => byMinute.get(minute) as number),
    };
};

/** Reads Keepa's interleaved `[minutes, value, minutes, value, …]` array into a series. */
export const parseKeepaInterleavedSeries = (
    metric: string,
    categoryId: number,
    interleaved: readonly number[] | undefined
) => {
    if (!interleaved) return null;
    const pairs: [number, number][] = [];
    for (let index = 0; index + 1 < interleaved.length; index += 2) {
        pairs.push([interleaved[index], interleaved[index + 1]]);
    }
    return buildKeepaHistorySeries(metric, categoryId, pairs);
};

export const decodeKeepaHistorySeries = (series: KeepaHistorySeries): KeepaHistoryPoint[] =>
    series.keepaMinutes.map((keepaMinutes, index) => {
        const value = series.values[index];
        const isMissing = value === undefined || value < 0;
        return {
            metric: series.metric,
            categoryId: series.categoryId,
            observedAt: keepaMinuteToDate(keepaMinutes),
            keepaMinutes,
            valueInt: isMissing ? null : value,
            isMissing,
        };
    });

/** Decodes several series (a metric across categories) into one list, oldest first. */
export const decodeKeepaHistorySeriesList = (seriesList: readonly KeepaHistorySeries[]) =>
    seriesList
        .flatMap(decodeKeepaHistorySeries)
        .sort(
            (left, right) =>
                left.keepaMinutes - right.keepaMinutes || left.categoryId - right.categoryId
        );

/**
 * Picks the points a history read returns from points sorted oldest first. A bounded read returns
 * every point in `[startAt, endAt]` plus the last point before `startAt`, so the value in force at
 * the start is known; an unbounded read returns the latest `limit` points. Oldest first.
 */
export const selectKeepaHistoryWindow = <Point extends { observedAt: Date }>(
    points: readonly Point[],
    { startAt, endAt, limit }: { startAt?: Date; endAt?: Date; limit: number }
): Point[] => {
    if (!startAt && !endAt) return limit > 0 ? points.slice(-limit) : [];

    const startMs = startAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const endMs = endAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const window: Point[] = [];
    let carry: Point | undefined;
    for (const point of points) {
        const at = point.observedAt.getTime();
        if (at < startMs) carry = point;
        else if (at <= endMs) window.push(point);
    }
    return carry ? [carry, ...window] : window;
};

/** The point in force at `keepaMinute` (the last at or before it), from points oldest first. */
export const keepaHistoryPointAt = <Point extends { keepaMinutes: number }>(
    points: readonly Point[],
    keepaMinute: number
): Point | undefined => {
    let low = 0;
    let high = points.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (points[middle].keepaMinutes <= keepaMinute) low = middle + 1;
        else high = middle;
    }
    return low > 0 ? points[low - 1] : undefined;
};
