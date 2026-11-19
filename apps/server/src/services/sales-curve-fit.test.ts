import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    BADGE_FLOOR,
    curveMedianSales,
    fitSalesCurve,
    nextBadge,
    type SalesCurve,
    type SalesObservation,
    salesCurveNegativeLogLikelihood,
} from './sales-curve-fit';

const truth: SalesCurve = {
    knots: [60_000, 400_000],
    logSalesAtKnots: [Math.log(2_000), Math.log(2_000) - 1.8 * Math.log(400_000 / 60_000)],
    headSlope: -0.9,
    tailSlope: -1.1,
    sigma: 0.8,
    missing: 0.05,
};

describe('curveMedianSales', () => {
    it('follows the head slope, the line between the bends, then the tail slope', () => {
        const curve: SalesCurve = {
            knots: [10_000, 100_000],
            logSalesAtKnots: [Math.log(1_000), Math.log(100)],
            headSlope: -2,
            tailSlope: -0.5,
            sigma: 1,
            missing: 0,
        };
        expect(
            [1_000, 10_000, 31_623, 100_000, 400_000].map(bsr =>
                Math.round(curveMedianSales(curve, bsr))
            )
        ).toEqual([100_000, 1_000, 316, 100, 50]);
    });
});

describe('fitSalesCurve', () => {
    it('recovers both bends and every slope from badge floors, absences and Keepa gaps', () => {
        const curve = fitSalesCurve(simulate(truth, 6_000));
        expect(curve).not.toBeNull();
        if (!curve) return;
        // Bends sit on a ×1.5 grid, so each lands within one step of the truth.
        expect(Math.abs(Math.log(curve.knots[0] / truth.knots[0]))).toBeLessThan(Math.log(1.5));
        expect(Math.abs(Math.log(curve.knots[1] / truth.knots[1]))).toBeLessThan(Math.log(1.5));
        expect(Math.abs(curve.headSlope - truth.headSlope)).toBeLessThan(0.15);
        expect(Math.abs(middleSlope(curve) - middleSlope(truth))).toBeLessThan(0.15);
        expect(Math.abs(curve.tailSlope - truth.tailSlope)).toBeLessThan(0.15);
        expect(Math.abs(curve.sigma - truth.sigma)).toBeLessThan(0.15);
        expect(Math.abs(curve.missing - truth.missing)).toBeLessThan(0.03);
        for (const bsr of [20_000, 100_000, 1_000_000]) {
            const ratio = curveMedianSales(curve, bsr) / curveMedianSales(truth, bsr);
            expect(Math.abs(Math.log(ratio))).toBeLessThan(0.2);
        }
    });

    it('matches the badges on the 2026-11-19 production snapshot', () => {
        const observations = readSnapshot();
        const curve = fitSalesCurve(observations);
        expect(curve).not.toBeNull();
        if (!curve) return;
        // Typical badged shirt per rank: 10–20K ≈1,400, 20–40K ≈750, 40–80K ≈350, ≈200 at #100K.
        const anchors = [
            [10_000, 1_400],
            [30_000, 700],
            [50_000, 400],
            [100_000, 200],
        ] as const;
        for (const [bsr, typical] of anchors) {
            const ratio = curveMedianSales(curve, bsr) / typical;
            expect(Math.abs(Math.log(ratio))).toBeLessThan(Math.log(1.6));
        }
        // The single bend at #300K this curve replaced scored 36,986.0 on the same snapshot.
        expect(salesCurveNegativeLogLikelihood(observations, curve)).toBeLessThan(36_900);
    });

    it('never sells less at a better rank', () => {
        const curve = fitSalesCurve(readSnapshot());
        expect(curve).not.toBeNull();
        if (!curve) return;
        const sweep = Array.from({ length: 2_001 }, (_, i) => 1_000 * 10_000 ** (i / 2_000));
        const sales = sweep.map(bsr => curveMedianSales(curve, bsr));
        expect(sales.every((value, i) => i === 0 || value <= (sales[i - 1] ?? 0))).toBe(true);
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

const middleSlope = (curve: SalesCurve) =>
    (curve.logSalesAtKnots[1] - curve.logSalesAtKnots[0]) /
    Math.log(curve.knots[1] / curve.knots[0]);

/** Production observations as the fit reads them: one row per log-rank bin and badge reading. */
const readSnapshot = (): SalesObservation[] =>
    readFileSync(
        join(import.meta.dir, 'fixtures/sales-curve-observations-2026-11-19.jsonl'),
        'utf8'
    )
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => JSON.parse(line) as { bin: number; sold: number | null; count: number })
        .map(row => ({ bsr: Math.exp(row.bin / 8), sold: row.sold, count: row.count }));

/**
 * Products at log-uniform ranks, read as Keepa reports Amazon's badge and counted per log-rank
 * bin and badge reading, as readSalesCurveObservations groups them.
 */
const simulate = (curve: SalesCurve, count: number): SalesObservation[] => {
    const random = seeded(7);
    const rows = new Map<string, SalesObservation>();
    for (let product = 0; product < count; product++) {
        const rank = Math.exp(Math.log(5_000) + random() * Math.log(3_000_000 / 5_000));
        const bsr = Math.exp(Math.round(Math.log(rank) * 8) / 8);
        const z = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
        const sales = curveMedianSales(curve, rank) * Math.exp(curve.sigma * z);
        const sold = random() < curve.missing || sales < BADGE_FLOOR ? null : badgeFloor(sales);
        const key = `${bsr}:${sold}`;
        rows.set(key, { bsr, sold, count: (rows.get(key)?.count ?? 0) + 1 });
    }
    return [...rows.values()];
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
