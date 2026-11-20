import { describe, expect, it } from 'bun:test';
import { curveBadgeShare, type SalesCurve } from './sales-curve-fit';
import { buildSalesCurveReport } from './sales-curve-report';

const curve: SalesCurve = {
    knots: [300_000, 600_000],
    logSalesAtKnots: [Math.log(150), Math.log(150) - 2 * Math.log(2)],
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

    it('merges sparse best-rank bins so the head still draws evidence', () => {
        const { evidence } = buildSalesCurveReport(
            [
                { bsr: 8_000, sold: 1_000, count: 3 },
                { bsr: 12_500, sold: 1_000, count: 3 },
                { bsr: 20_000, sold: 600, count: 2 },
                { bsr: 120_000, sold: 100, count: 9 },
            ],
            curve
        );
        // 8 shirts across three bins, at their mean log rank: (8K·12.5K)^(3/8) · 20K^(2/8).
        expect(evidence).toEqual([
            {
                bsr: Math.round(Math.exp((3 * Math.log(8_000 * 12_500) + 2 * Math.log(20_000)) / 8)),
                products: 8,
                typicalSales: Math.sqrt(1_000 * 2_000),
            },
            { bsr: 120_000, products: 9, typicalSales: Math.sqrt(100 * 200) },
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
