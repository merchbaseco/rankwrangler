import type { SeededRandom } from '@/dev-seed/random';

/**
 * The yearly demand shape behind seeded rank history, so Explore's
 * seasonality chart has a year with a shape. Each audience peaks once a year
 * around its calendar moment (Halloween in late October, teachers at back to
 * school, Nurses Week in May); every design also lifts a little into the
 * Q4 gift season. Last year runs a little weaker, as a catalog grows.
 */

interface Season {
    /** Day of the year (0-based) demand peaks. */
    readonly peakDay: number;
    /** Peak demand as a multiple of the off-season. */
    readonly lift: number;
    /** Days either side of the peak for one standard deviation. */
    readonly width: number;
}

/** Ranks run this much worse per year back, so an older year sits lower. */
const YEARLY_DECAY = 0.3;
/** Mild late-November lift every design carries. */
const GIFT_SEASON: Season = { peakDay: 330, lift: 0.6, width: 20 };
/** The fallback for audiences without a calendar moment. */
const EVERGREEN: Season = { peakDay: 182, lift: 0.15, width: 60 };

const audienceSeasons: Readonly<Record<string, Season>> = {
    'autism-awareness': { peakDay: 95, lift: 3, width: 12 },
    christmas: { peakDay: 345, lift: 6, width: 14 },
    fishing: { peakDay: 160, lift: 1.5, width: 35 },
    gardening: { peakDay: 120, lift: 1.5, width: 30 },
    'girl-dad': { peakDay: 162, lift: 3, width: 9 },
    grandma: { peakDay: 126, lift: 2.5, width: 9 },
    halloween: { peakDay: 295, lift: 6, width: 12 },
    'mental-health': { peakDay: 130, lift: 1.5, width: 18 },
    nurse: { peakDay: 126, lift: 2.5, width: 8 },
    pickleball: { peakDay: 170, lift: 1.2, width: 40 },
    teacher: { peakDay: 225, lift: 3, width: 14 },
};

/**
 * How much worse (above 1) or better (below 1) a design ranks on a day than today, from its
 * audience season alone.
 */
export const seasonFactor = ({
    audience,
    day,
    now,
}: {
    audience: string | undefined;
    day: Date;
    now: Date;
}) => {
    const season = (audience && audienceSeasons[audience]) || EVERGREEN;
    const demand = (1 + bump(season, day)) * (1 + bump(GIFT_SEASON, day));
    const today = (1 + bump(season, now)) * (1 + bump(GIFT_SEASON, now));
    return today / demand;
};

/**
 * A design's rank on a day from its current rank: better (lower) as demand
 * lifts, worse in earlier years, with day-to-day noise.
 */
export const seasonalRank = ({
    audience,
    baseRank,
    day,
    now,
    random,
}: {
    audience: string | undefined;
    baseRank: number;
    day: Date;
    now: Date;
    random: SeededRandom;
}) => {
    const yearsBack = (now.getTime() - day.getTime()) / (365.25 * 86_400_000);
    const noise = Math.exp(random.normal() * 0.12);
    return Math.max(
        1,
        Math.round(
            baseRank * seasonFactor({ audience, day, now }) * (1 + yearsBack * YEARLY_DECAY) * noise
        )
    );
};

/** Extra demand on a day: `lift` at the peak, falling off on a bell either side. */
const bump = (season: Season, day: Date) => {
    const dayOfYear = (day.getTime() - Date.UTC(day.getUTCFullYear(), 0, 1)) / 86_400_000;
    const raw = Math.abs(dayOfYear - season.peakDay);
    const distance = Math.min(raw, 365 - raw);
    return season.lift * Math.exp(-0.5 * (distance / season.width) ** 2);
};
