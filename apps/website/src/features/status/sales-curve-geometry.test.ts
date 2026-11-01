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

    test('a phone keeps only the tier edges on the rank axis', () => {
        const phone = salesCurveGeometry(curve, [], { height: 320, width: 340 });
        expect(phone.xTicks.map(tick => tick.label)).toEqual(['#100K', '#300K', '#1M']);
    });

    test('evidence outside the rank axis is left off', () => {
        expect(geometry.evidence).toHaveLength(1);
        expect(geometry.evidence[0]?.tier).toBe('strong');
    });

    test('the line is solid to the last badged rank and projects past it', () => {
        const solidEnd = geometry.observedLine.split(' L').at(-1);
        const projectedStart = geometry.projectedLine.slice(1).split(' L')[0];
        expect(solidEnd).toBe(projectedStart);
        expect(geometry.markers.map(marker => marker.tier)).toEqual(['hot', 'strong', 'steady']);
    });
});
