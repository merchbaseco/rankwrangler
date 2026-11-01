import { describe, expect, it } from 'bun:test';
import { curveBadgeShare, type SalesCurve } from './sales-curve-fit';
import { buildSalesCurveReport } from './sales-curve-report';

const curve: SalesCurve = {
    intercept: Math.log(150),
    headSlope: -0.9,
    tailSlope: -2,
    sigma: 0.75,
    missing: 0.1,
};

describe('buildSalesCurveReport', () => {
    it('draws evidence only where most of a bin shows a badge', () => {
        const { evidence } = buildSalesCurveReport(
            [
                { bsr: 120_000, sold: 100, count: 6 },
                { bsr: 120_000, sold: 300, count: 4 },
                { bsr: 120_000, sold: null, count: 2 },
                { bsr: 700_000, sold: 50, count: 3 },
                { bsr: 700_000, sold: null, count: 9 },
                { bsr: 2_000_000, sold: 100, count: 4 },
            ],
            curve
        );
        // 10 of 12 badged at #120K, median badge 100 → the 100–199 step's midpoint.
        expect(evidence).toEqual([
            { bsr: 120_000, products: 12, typicalSales: Math.sqrt(100 * 200) },
        ]);
    });

    it('sets each rank range against the share the curve expects', () => {
        const { ranges } = buildSalesCurveReport(
            [
                { bsr: 120_000, sold: 200, count: 8 },
                { bsr: 120_000, sold: null, count: 2 },
                { bsr: 5_000_000, sold: null, count: 5 },
            ],
            curve
        );
        expect(ranges).toHaveLength(1);
        expect(ranges[0]).toMatchObject({ min: 100_000, max: 150_000, products: 10, badged: 8 });
        expect(ranges[0]?.expectedShare).toBeCloseTo(curveBadgeShare(curve, 120_000), 10);
    });
});

describe('curveBadgeShare', () => {
    it('falls with rank and never exceeds the share Keepa reports a badge for', () => {
        expect(curveBadgeShare(curve, 50_000)).toBeLessThanOrEqual(1 - curve.missing);
        expect(curveBadgeShare(curve, 50_000)).toBeGreaterThan(curveBadgeShare(curve, 1_000_000));
    });
});
