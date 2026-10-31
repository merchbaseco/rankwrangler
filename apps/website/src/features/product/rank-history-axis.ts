import { formatCompact } from '@/features/bsr/bsr-format';
import { type BsrTier, bsrTiers, tierRankRange } from '@/features/bsr/bsr-tier';

/** The rank chart's windows, oldest bound in days (null is everything stored). */
export const historyRanges = ['30d', '90d', '1y', 'all'] as const;

export type HistoryRange = (typeof historyRanges)[number];

export const historyRangeLabels: Readonly<Record<HistoryRange, string>> = {
    '30d': '30d',
    '90d': '90d',
    '1y': '1y',
    all: 'All',
};

export const historyRangeDays: Readonly<Record<HistoryRange, number | null>> = {
    '30d': 30,
    '90d': 90,
    '1y': 365,
    all: null,
};

export const isHistoryRange = (key: unknown): key is HistoryRange =>
    typeof key === 'string' && (historyRanges as readonly string[]).includes(key);

/** Breathing room above and below the line on the log axis (×/÷ this factor). */
const DOMAIN_PAD = 1.6;
const DAY_MS = 86_400_000;

/**
 * The log-axis rank domain for a series: its best and worst rank padded by a
 * constant factor, so the line never touches the plot edges. Falls back to the
 * full tier span when there is nothing to plot.
 */
export const rankDomain = (ranks: readonly number[]): [number, number] => {
    const positive = ranks.filter(rank => rank > 0);
    if (positive.length === 0) {
        return [1000, 500_000];
    }
    const best = Math.min(...positive);
    const worst = Math.max(...positive);
    return [Math.max(1, Math.floor(best / DOMAIN_PAD)), Math.ceil(worst * DOMAIN_PAD)];
};

/**
 * Log-axis ticks inside the domain, labelled `1K`, `10K`, `100K`: powers of
 * ten, or the 1-2-5 steps when a narrow domain would hold only one.
 */
export const rankTicks = ([low, high]: readonly [number, number]): number[] => {
    const decades = ticksIn(low, high, [1]);
    return decades.length >= 2 ? decades : ticksIn(low, high, [1, 2, 5]);
};

const ticksIn = (low: number, high: number, steps: readonly number[]) => {
    const ticks: number[] = [];
    for (let decade = 10 ** Math.floor(Math.log10(low)); decade <= high; decade *= 10) {
        for (const step of steps) {
            const tick = decade * step;
            if (tick >= low && tick <= high) {
                ticks.push(tick);
            }
        }
    }
    return ticks;
};

export const formatRankTick = (value: number) => formatCompact(value);

export interface TierBand {
    readonly tier: BsrTier;
    readonly y1: number;
    readonly y2: number;
}

/** Each tier's rank span clipped to the domain, dropping tiers outside it. */
export const tierBands = ([low, high]: readonly [number, number]): TierBand[] =>
    bsrTiers.flatMap(tier => {
        const range = tierRankRange(tier);
        const y1 = Math.max(range.min, low);
        const y2 = Math.min(range.max ?? high, high);
        return y1 < y2 ? [{ tier, y1, y2 }] : [];
    });

/**
 * How tall a tier band draws, in px, on a log axis `plotHeight` px tall: its
 * share of the domain's log span. A band label needs at least
 * `MIN_BAND_LABEL_PX` of it, or it would spill over the next band or the axis.
 */
export const bandPixelHeight = (
    band: TierBand,
    [low, high]: readonly [number, number],
    plotHeight: number
) => {
    const span = Math.log(high) - Math.log(low);
    return span > 0 ? ((Math.log(band.y2) - Math.log(band.y1)) / span) * plotHeight : 0;
};

export const MIN_BAND_LABEL_PX = 14;

/**
 * X-axis ticks for a time span: weekly for a month or less, otherwise the
 * first of each month, thinned on the calendar (every 2, 3, 6 or 12 months
 * counted from January) so at most 13 labels fit and January always stays.
 */
export const timeTicks = (start: number, end: number): number[] => {
    if (!(end > start)) {
        return [];
    }
    if (end - start <= 45 * DAY_MS) {
        const ticks: number[] = [];
        for (let tick = start + 3 * DAY_MS; tick < end; tick += 7 * DAY_MS) {
            ticks.push(tick);
        }
        return ticks;
    }
    const months: number[] = [];
    const cursor = new Date(start);
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    while (cursor.getTime() < end) {
        months.push(cursor.getTime());
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const needed = Math.ceil(months.length / 13);
    const step = monthSteps.find(candidate => candidate >= needed) ?? 12 * Math.ceil(needed / 12);
    return months.filter(month => new Date(month).getUTCMonth() % step === 0);
};

const monthSteps = [1, 2, 3, 6, 12] as const;

/** `Oct` for a month tick, `Oct 3` for a weekly one. */
export const formatTimeTick = (value: number, spanMs: number) =>
    new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        ...(spanMs <= 45 * DAY_MS ? { day: 'numeric', month: 'short' } : { month: 'short' }),
    }).format(new Date(value));
