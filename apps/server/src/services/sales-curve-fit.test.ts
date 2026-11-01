import { describe, expect, it } from 'bun:test';
import {
    BADGE_FLOOR,
    curveMedianSales,
    fitSalesCurve,
    nextBadge,
    REFERENCE_BSR,
    type SalesCurve,
    type SalesObservation,
} from './sales-curve-fit';

const truth: SalesCurve = {
    intercept: Math.log(120),
    headSlope: -0.9,
    tailSlope: -2,
    sigma: 0.8,
    missing: 0.1,
};

describe('fitSalesCurve', () => {
    it('recovers a curve from badge floors, absent badges and Keepa gaps', () => {
        const curve = fitSalesCurve(simulate(truth, 4_000));
        expect(curve).not.toBeNull();
        if (!curve) return;
        expect(Math.abs(curve.headSlope - truth.headSlope)).toBeLessThan(0.1);
        expect(Math.abs(curve.tailSlope - truth.tailSlope)).toBeLessThan(0.15);
        expect(Math.abs(curve.sigma - truth.sigma)).toBeLessThan(0.15);
        expect(Math.abs(curve.missing - truth.missing)).toBeLessThan(0.03);
        const ratio =
            curveMedianSales(curve, REFERENCE_BSR) / curveMedianSales(truth, REFERENCE_BSR);
        expect(Math.abs(Math.log(ratio))).toBeLessThan(0.15);
    });

    it('says nothing until enough Products carry a badge', () => {
        expect(fitSalesCurve(simulate(truth, 20))).toBeNull();
        expect(fitSalesCurve([{ bsr: 100_000, sold: 500, count: 100 }])).toBeNull();
    });
});

describe('nextBadge', () => {
    it('steps 50, then hundreds below 1K, thousands below 10K', () => {
        expect([50, 100, 900, 1_000, 9_000, 10_000].map(nextBadge)).toEqual([
            100, 200, 1_000, 2_000, 10_000, 20_000,
        ]);
    });
});

/** Products at log-uniform ranks, read as Keepa reports Amazon's badge. */
const simulate = (curve: SalesCurve, count: number): SalesObservation[] => {
    const random = seeded(7);
    return Array.from({ length: count }, () => {
        const bsr = Math.exp(Math.log(20_000) + random() * Math.log(3_000_000 / 20_000));
        const z = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
        const sold = curveMedianSales(curve, bsr) * Math.exp(curve.sigma * z);
        const missing = random() < curve.missing;
        return { bsr, sold: missing || sold < BADGE_FLOOR ? null : badgeFloor(sold), count: 1 };
    });
};

const badgeFloor = (sold: number) => {
    if (sold < 100) return 50;
    const step = 10 ** Math.floor(Math.log10(sold));
    return Math.floor(sold / step) * step;
};

/** Mulberry32: a small deterministic generator, so the fit sees the same sample every run. */
const seeded = (seed: number) => {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
};
