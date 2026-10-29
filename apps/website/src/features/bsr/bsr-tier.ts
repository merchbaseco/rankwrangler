/**
 * BSR tiers: the one classification every screen colors rank by. Thresholds are
 * inclusive upper bounds on Amazon's main-category Best Sellers Rank, from
 * `docs/decisions/website-visual-direction.md`; a starting guess to tune
 * against real sell-through. Colors are theme tokens (`.tier-<key>` in
 * theme/product.css sets `--tier-fg/bg/bd`), so nothing here names a hex.
 */
export const bsrTiers = ['elite', 'hot', 'strong', 'steady', 'slow'] as const;

export type BsrTier = (typeof bsrTiers)[number];

export interface BsrTierDefinition {
    readonly key: BsrTier;
    readonly label: string;
    /** Inclusive upper bound, or null for the open-ended last tier. */
    readonly max: number | null;
    /** Compact range for chips, e.g. `≤2.5K` or `250K+`. */
    readonly rangeLabel: string;
}

export const bsrTierDefinitions: Readonly<Record<BsrTier, BsrTierDefinition>> = {
    elite: { key: 'elite', label: 'Elite', max: 2500, rangeLabel: '≤2.5K' },
    hot: { key: 'hot', label: 'Hot', max: 15_000, rangeLabel: '≤15K' },
    strong: { key: 'strong', label: 'Strong', max: 60_000, rangeLabel: '≤60K' },
    steady: { key: 'steady', label: 'Steady', max: 250_000, rangeLabel: '≤250K' },
    slow: { key: 'slow', label: 'Slow', max: null, rangeLabel: '250K+' },
};

/** The tier for a rank. A missing rank reads as `slow`: nothing says it sells. */
export const classifyBsr = (salesRank: number | null | undefined): BsrTier => {
    if (salesRank === null || salesRank === undefined || salesRank <= 0) {
        return 'slow';
    }
    for (const tier of bsrTiers) {
        const { max } = bsrTierDefinitions[tier];
        if (max === null || salesRank <= max) {
            return tier;
        }
    }
    return 'slow';
};

/** The theme hook class that scopes `--tier-fg/bg/bd` to one tier. */
export const tierClassName = (tier: BsrTier) => `tier-${tier}` as const;

/** Inclusive rank bounds of one tier. */
export const tierRankRange = (tier: BsrTier): { min: number; max: number | null } => {
    const index = bsrTiers.indexOf(tier);
    const previous = index > 0 ? bsrTiers[index - 1] : undefined;
    const previousMax = previous ? bsrTierDefinitions[previous].max : 0;
    return { min: (previousMax ?? 0) + 1, max: bsrTierDefinitions[tier].max };
};

/**
 * The single contiguous rank span covering every selected tier, for a server
 * filter that accepts one range. Non-adjacent selections (Elite + Steady) span
 * the tiers between, so callers still filter rows with `classifyBsr`. Returns
 * undefined when nothing is selected (no rank filter).
 */
export const tierSalesRankSpan = (
    tiers: Iterable<BsrTier>
): { min: number; max?: number } | undefined => {
    const selected = bsrTiers.filter(tier => new Set(tiers).has(tier));
    const first = selected[0];
    const last = selected.at(-1);
    if (!(first && last)) {
        return undefined;
    }
    const max = tierRankRange(last).max;
    return max === null
        ? { min: tierRankRange(first).min }
        : { min: tierRankRange(first).min, max };
};

/**
 * Estimated units sold per month from rank alone, for when Amazon's "bought in
 * past month" badge is absent. A power-law fit (`260000 / bsr^0.82`) that
 * matches the mocks; treat it as an order of magnitude, never a count.
 */
export const estimateMonthlySales = (salesRank: number | null | undefined): number | null => {
    if (salesRank === null || salesRank === undefined || salesRank <= 0) {
        return null;
    }
    return Math.max(1, Math.round(260_000 / salesRank ** 0.82));
};

/**
 * A rank's strength on a log scale for bars and meters (Grid I): #600 and
 * better is 1, #6M and worse is 0. Null for no rank.
 */
export const rankStrength = (rank: number | null | undefined): number | null =>
    rank === null || rank === undefined || rank <= 0
        ? null
        : Math.min(1, Math.max(0, (Math.log(6_000_000) - Math.log(rank)) / Math.log(10_000)));
