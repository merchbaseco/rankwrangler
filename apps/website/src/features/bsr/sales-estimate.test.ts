import { describe, expect, test } from 'bun:test';
import { estimateMonthlySales, formatSalesPace } from './sales-estimate';

const curve = {
    headSlope: -1,
    intercept: Math.log(100),
    referenceBsr: 300_000,
    sigma: 1,
    tailSlope: -2,
};

describe('estimateMonthlySales', () => {
    test('reads the curve median at a rank', () => {
        expect(estimateMonthlySales(300_000, curve)).toBe(100);
        expect(estimateMonthlySales(75_000, curve)).toBe(400);
        expect(estimateMonthlySales(600_000, curve)).toBe(25);
    });

    test('falls with rank and never reaches zero', () => {
        expect(estimateMonthlySales(1_000_000, curve)).toBeLessThan(
            estimateMonthlySales(500_000, curve) ?? 0
        );
        expect(estimateMonthlySales(1e12, curve)).toBe(1);
    });

    test('says nothing without a rank or a curve', () => {
        expect(estimateMonthlySales(null, curve)).toBeNull();
        expect(estimateMonthlySales(0, curve)).toBeNull();
        expect(estimateMonthlySales(300_000, null)).toBeNull();
    });
});

describe('formatSalesPace', () => {
    test('reads a monthly figure as a daily pace', () => {
        expect(formatSalesPace(413)).toBe('≈14 a day');
        expect(formatSalesPace(30)).toBe('≈1 a day');
        expect(formatSalesPace(14)).toBe('≈1 every 2 days');
        expect(formatSalesPace(3)).toBe('≈1 every 10 days');
    });
});
