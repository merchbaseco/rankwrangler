import type { BuilderContext } from '@/dev-seed/types';

/**
 * Rank and demand for a seeded Product, shaped like the Explore mock's table:
 * mostly Hot, Strong and Elite sellers with a Steady shoulder and a few slow
 * movers, so the first screen shows the tier mix rather than a grey wall.
 * Monthly sold follows the rank through production's fitted sales curve, read
 * the way Keepa reports Amazon's badge, so the dev server's own refit of the
 * curve lands near production's; rank drops follow the mock's 30-day curve.
 */

/** Tier share and BSR range (log-uniform inside it), Elite to Slow. */
const RANK_BANDS = [
    { share: 0.13, min: 7_000, max: 25_000 },
    { share: 0.38, min: 25_001, max: 100_000 },
    { share: 0.3, min: 100_001, max: 300_000 },
    { share: 0.11, min: 300_001, max: 1_000_000 },
    { share: 0.08, min: 1_200_000, max: 5_000_000 },
] as const;

/** The deepest rank the demand weight maps back from. */
const DEMAND_RANK_SPAN = 24_000_000;

export interface SeedDemand {
    /** Main-category BSR, or null for a Product Keepa has never ranked. */
    readonly rank: number | null;
    /** Weight in (0, 1]; Search placement still orders by it. */
    readonly demand: number;
}

/** Draws a rank from the tier bands; unranked Products get the weakest demand. */
export const drawSeedDemand = (context: BuilderContext, isRanked: boolean): SeedDemand => {
    if (!isRanked) {
        return { demand: 0.01, rank: null };
    }
    const roll = context.random.next();
    let cumulative = 0;
    const band =
        RANK_BANDS.find(candidate => {
            cumulative += candidate.share;
            return roll < cumulative;
        }) ?? RANK_BANDS[RANK_BANDS.length - 1];
    const rank = Math.round(
        Math.exp(context.random.between(Math.log(band.min), Math.log(band.max)))
    );
    const demand = 1 - Math.cbrt(Math.min(1, Math.max(0, rank - 9_000) / DEMAND_RANK_SPAN));
    return { demand: Math.min(1, Math.max(0.01, demand)), rank };
};

/**
 * Keepa's bought-past-month figure: production's sales curve (fitted November
 * 2026: about 150 a month at #300K, rank^-0.9 above it and rank^-2 below) with
 * a ×0.5–×2 spread, floored to Amazon's badge steps, and absent under 50 a
 * month as Amazon's is. The spread comes from the rank itself, so the badge
 * draws nothing from the seed's random stream and retuning it never reshuffles
 * the rest of the catalog.
 */
export const monthlySoldForRank = (rank: number | null) => {
    if (rank === null) {
        return null;
    }
    const slope = rank < 300_000 ? -0.9 : -2;
    const spread = 2 ** (2 * ((rank * GOLDEN_RATIO) % 1) - 1);
    const sold = 150 * (rank / 300_000) ** slope * spread;
    return sold < 50 ? null : badgeFloor(sold);
};

const GOLDEN_RATIO = 0.618_033_988_7;

/** Amazon's badge floor for a monthly count: 50+, then hundreds, thousands and so on. */
const badgeFloor = (sold: number) => {
    if (sold < 100) {
        return 50;
    }
    const step = 10 ** Math.floor(Math.log10(sold));
    return Math.floor(sold / step) * step;
};

/** Rank drops over a window: the mock's 30-day curve, scaled to the window. */
export const dropsForRank = (context: BuilderContext, rank: number | null, days: number) => {
    if (rank === null) {
        return 0;
    }
    const thirtyDay = 2400 / rank ** 0.45;
    return Math.max(0, Math.round(thirtyDay * (days / 30) * context.random.between(0.8, 1.2)));
};
