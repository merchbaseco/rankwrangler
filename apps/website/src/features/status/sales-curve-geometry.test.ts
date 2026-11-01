import { describe, expect, test } from 'bun:test';
import { accuracyBarsGeometry, salesCurveGeometry } from './sales-curve-geometry';

const curve = {
    headSlope: -0.9,
    intercept: Math.log(150),
    referenceBsr: 300_000,
    sigma: 0.75,
    tailSlope: -2,
};

describe('sales curve geometry', () => {
    const geometry = salesCurveGeometry(
        curve,
        [
            { bsr: 120_000, typicalSales: 400 },
            { bsr: 10_000, typicalSales: 5_000 },
        ],
        { height: 320, width: 800 }
    );

    test('tier bands tile the rank axis without gaps', () => {
        expect(geometry.bands.map(band => band.tier)).toEqual(['hot', 'strong', 'steady', 'slow']);
        const [first, ...rest] = geometry.bands;
        expect(first?.x).toBe(geometry.plot.left);
        rest.reduce((previous, band) => {
            expect(band.x).toBeCloseTo(previous.x + previous.width);
            return band;
        }, first ?? geometry.bands[0]);
    });

    test('a better rank sits left and sells more, so it draws higher', () => {
        const strong = geometry.pointAt(200_000);
        const slow = geometry.pointAt(2_000_000);
        expect(strong.x).toBeLessThan(slow.x);
        expect(strong.y).toBeLessThan(slow.y);
        expect(geometry.rankAt(strong.x)).toBeCloseTo(200_000, -2);
    });

    test('on a phone, the last callout turns left and crowded rank ticks drop out', () => {
        const phone = salesCurveGeometry(curve, [], { height: 320, width: 340 });
        expect(phone.callouts.at(-1)?.anchor).toBe('end');
        expect(phone.callouts[0]?.anchor).toBe('start');
        expect(phone.xTicks.map(tick => tick.label)).toEqual(['#100K', '#300K', '#1M']);
    });

    test('evidence outside the rank axis is left off, and callouts read as a pace', () => {
        expect(geometry.evidence).toHaveLength(1);
        expect(geometry.evidence[0]?.tier).toBe('strong');
        expect(geometry.callouts.map(callout => callout.label)).toEqual([
            '≈13 a day',
            '≈5 a day',
            '≈1 every 2 days',
        ]);
    });
});

describe('accuracy bars geometry', () => {
    test('a column rises to its share and the tick marks the expectation', () => {
        const { bars, plot } = accuracyBarsGeometry(
            [
                { actual: 0.5, expected: 0.25, max: 60_000, min: 40_000 },
                { actual: 0, expected: 0.1, max: 100_000, min: 60_000 },
            ],
            { height: 180, width: 400 }
        );
        const height = plot.bottom - plot.top;
        expect(bars[0]?.expected.y).toBeCloseTo(plot.bottom - 0.25 * height);
        expect(bars[0]?.column).toContain(`V${plot.bottom}Z`);
        expect(bars[1]?.slot.x).toBeCloseTo(plot.left + (plot.right - plot.left) / 2);
    });

    test('the rank axis labels the edges between ranges', () => {
        const rows = [40_000, 60_000, 100_000, 150_000].map((min, index, mins) => ({
            actual: 0.5,
            expected: 0.5,
            max: mins[index + 1] ?? 200_000,
            min,
        }));
        const wide = accuracyBarsGeometry(rows, { height: 180, width: 600 });
        expect(wide.edges.map(edge => edge.label)).toEqual([
            '#40K',
            '#60K',
            '#100K',
            '#150K',
            '#200K',
        ]);
        const narrow = accuracyBarsGeometry(rows, { height: 180, width: 200 });
        expect(narrow.edges.map(edge => edge.label)).toEqual(['#40K', '#100K', '#200K']);
    });
});
