import type { BuilderContext } from '@/dev-seed/types';

/**
 * Rank and demand for a seeded Product, shaped like the Explore mock's table:
 * mostly Hot, Strong and Elite sellers with a Steady shoulder and a few slow
 * movers, so the first screen shows the tier mix rather than a grey wall.
 * Monthly sold and rank drops follow the rank through the same curves the
 * website uses to estimate them, so a card's `#4,400 · 230/mo` reads true.
 */

/** Tier share and BSR range (log-uniform inside it), Elite to Slow. */
const RANK_BANDS = [
    { share: 0.13, min: 700, max: 2_500 },
    { share: 0.38, min: 2_501, max: 15_000 },
    { share: 0.3, min: 15_001, max: 60_000 },
    { share: 0.11, min: 60_001, max: 250_000 },
    { share: 0.08, min: 400_000, max: 1_500_000 },
] as const;

/** The deepest rank the demand weight maps back from (mirrors the old curve). */
const DEMAND_RANK_SPAN = 2_400_000;

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
    const demand = 1 - Math.cbrt(Math.min(1, Math.max(0, rank - 900) / DEMAND_RANK_SPAN));
    return { demand: Math.min(1, Math.max(0.01, demand)), rank };
};

/**
 * Keepa's bought-past-month figure: the website's sales curve (bsr-tier.ts
 * `estimateMonthlySales`) with a little noise; Keepa omits it for slow movers.
 */
export const monthlySoldForRank = (context: BuilderContext, rank: number | null) => {
    if (rank === null || rank > 250_000) {
        return null;
    }
    const sold = 260_000 / rank ** 0.82;
    return Math.max(1, Math.round(sold * context.random.between(0.92, 1.08)));
};

/** Rank drops over a window: the mock's 30-day curve, scaled to the window. */
export const dropsForRank = (context: BuilderContext, rank: number | null, days: number) => {
    if (rank === null) {
        return 0;
    }
    const thirtyDay = 2400 / rank ** 0.45;
    return Math.max(0, Math.round(thirtyDay * (days / 30) * context.random.between(0.8, 1.2)));
};
