import type { RankPoint } from '@/features/bsr/sparkline-geometry';

const DAY_MS = 86_400_000;

/**
 * The rank at the end of each of the last `days` UTC days, oldest first: the
 * latest change point at or before the day's close, carried forward. Days
 * before the first change point are left out, so a young listing draws a
 * short band rather than a made-up one.
 */
export const dailyRanks = (
    series: readonly RankPoint[],
    days: number,
    now = Date.now()
): RankPoint[] => {
    const points = sortedPoints(series);
    const out: RankPoint[] = [];
    let cursor = 0;
    let current: number | null = null;
    for (const close of dayCloses(days, now)) {
        while (cursor < points.length && (points[cursor]?.time ?? Infinity) <= close) {
            current = points[cursor]?.salesRank ?? current;
            cursor += 1;
        }
        if (current !== null) {
            out.push({ at: new Date(close).toISOString(), salesRank: current });
        }
    }
    return out;
};

/** The best (lowest) rank of each UTC month that has a change point, oldest first. */
export const monthlyBest = (series: readonly RankPoint[]): RankPoint[] => {
    const best = new Map<string, number>();
    for (const point of sortedPoints(series)) {
        const date = new Date(point.time);
        const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
        best.set(month, Math.min(best.get(month) ?? Infinity, point.salesRank));
    }
    return [...best].map(([at, salesRank]) => ({ at, salesRank }));
};

/**
 * Rank drops (a change point that improves on the one before it) on each of
 * the last `days` UTC days, oldest first, with the day's close as `at`.
 */
export const dailyDrops = (
    series: readonly RankPoint[],
    days: number,
    now = Date.now()
): { at: string; drops: number }[] => {
    const points = sortedPoints(series);
    const closes = dayCloses(days, now);
    const counts = closes.map(() => 0);
    const first = (closes[0] ?? now) - DAY_MS;
    for (let index = 1; index < points.length; index += 1) {
        const point = points[index];
        const previous = points[index - 1];
        if (!(point && previous) || point.salesRank >= previous.salesRank || point.time <= first) {
            continue;
        }
        const day = closes.findIndex(close => point.time <= close);
        if (day >= 0) {
            counts[day] = (counts[day] ?? 0) + 1;
        }
    }
    return closes.map((close, index) => ({
        at: new Date(close).toISOString(),
        drops: counts[index] ?? 0,
    }));
};

/** The last millisecond of each of the last `days` UTC days, today last. */
const dayCloses = (days: number, now: number) => {
    const todayClose = Math.floor(now / DAY_MS) * DAY_MS + DAY_MS - 1;
    return Array.from({ length: days }, (_, index) => todayClose - (days - 1 - index) * DAY_MS);
};

const sortedPoints = (series: readonly RankPoint[]) =>
    series
        .filter(point => point.salesRank > 0)
        .map(point => ({ salesRank: point.salesRank, time: Date.parse(point.at) }))
        .filter(point => Number.isFinite(point.time))
        .sort((left, right) => left.time - right.time);
