/**
 * Segment shares for a stacked mix bar (Explore's tier mix, Keywords' heat
 * mix): each count over the total, with every non-zero count lifted to at
 * least `minShare` so a tier of one design still has a segment to point at,
 * the rest scaled down to keep the sum at 1. Empty counts get 0.
 */
export const mixShares = (counts: readonly number[], minShare = 0.03): number[] => {
    const total = counts.reduce((sum, count) => sum + Math.max(0, count), 0);
    if (total === 0) {
        return counts.map(() => 0);
    }
    const raw = counts.map(count => Math.max(0, count) / total);
    const lifted = raw.map(share => (share > 0 && share < minShare ? minShare : 0));
    const liftedTotal = lifted.reduce((sum, share) => sum + share, 0);
    const restTotal = raw.reduce((sum, share, index) => sum + (lifted[index] ? 0 : share), 0);
    const scale = restTotal > 0 ? Math.max(0, 1 - liftedTotal) / restTotal : 0;
    return raw.map((share, index) => lifted[index] || share * scale);
};
