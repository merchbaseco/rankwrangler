import { keepaHistoryPointAt, lastKeepaMinuteAt } from './keepa-history-series';

/**
 * Seasonality of a set of designs: estimated sales a week over the last year, as one rolling
 * series. Env-free, so it is tested without a database.
 */

/** Weeks in the rolling year. */
export const SEASONALITY_WEEKS = 52;
const DAY_MS = 86_400_000;

export type SeasonalityWeek = {
    /** The week's first day, `YYYY-MM-DD` (UTC). */
    start: string;
    /** Summed estimated sales a week; null when no design had a rank at the week's end. */
    sales: number | null;
    /** Designs with a rank in force at the week's end. */
    designs: number;
};

export type SearchSeasonality = {
    /** Designs that contributed to at least one week. */
    sampled: number;
    /** Oldest first, SEASONALITY_WEEKS of them, the last ending at today's UTC midnight. */
    weeks: SeasonalityWeek[];
};

/** One design's main BSR series, Keepa minutes ascending; a value under 1 means no rank. */
export type SeasonalitySeries = {
    readonly keepaMinutes: readonly number[];
    readonly values: readonly number[];
};

/** Where the rolling year starts: SEASONALITY_WEEKS whole weeks before today's UTC midnight. */
export const seasonalityStart = (now: Date) =>
    new Date(todayStart(now) - SEASONALITY_WEEKS * 7 * DAY_MS);

/**
 * Buckets designs' BSR history into the last SEASONALITY_WEEKS whole weeks. Each week reads the
 * rank in force at its end (history is a step function: the last point at or before the instant)
 * and turns it into sales with `weeklySales`; a design counts only for weeks where it has a rank in
 * force. Null when no design contributed.
 */
export const bucketSeasonality = (
    series: readonly SeasonalitySeries[],
    weeklySales: (bsr: number) => number,
    now: Date
): SearchSeasonality | null => {
    const points = series.map(entry =>
        entry.keepaMinutes.map((keepaMinutes, index) => ({
            keepaMinutes,
            value: entry.values[index] ?? -1,
        }))
    );
    const contributed = new Set<number>();
    const first = seasonalityStart(now).getTime();
    const weeks = Array.from({ length: SEASONALITY_WEEKS }, (_, index): SeasonalityWeek => {
        const start = first + index * 7 * DAY_MS;
        // The last Keepa minute before the week ends: a point stamped then is still in force.
        const minute = lastKeepaMinuteAt(new Date(start + 7 * DAY_MS - 1));
        let sales = 0;
        let designs = 0;
        points.forEach((design, designIndex) => {
            const point = keepaHistoryPointAt(design, minute);
            if (!point || point.value < 1) return;
            sales += weeklySales(point.value);
            designs += 1;
            contributed.add(designIndex);
        });
        return {
            start: new Date(start).toISOString().slice(0, 10),
            sales: designs ? Math.round(sales) : null,
            designs,
        };
    });
    return contributed.size ? { sampled: contributed.size, weeks } : null;
};

const todayStart = (now: Date) =>
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
