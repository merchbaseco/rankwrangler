import { describe, expect, test } from 'bun:test';
import { formatBsr, formatBsrCompact, formatPrice } from './bsr-format';
import {
    classifyBsr,
    estimateMonthlySales,
    rankStrength,
    tierRankRange,
    tierSalesRankSpan,
} from './bsr-tier';
import { nearestSampleIndex, sparklineGeometry } from './sparkline-geometry';

describe('classifyBsr', () => {
    test('uses inclusive upper bounds', () => {
        expect(classifyBsr(1)).toBe('elite');
        expect(classifyBsr(2500)).toBe('elite');
        expect(classifyBsr(2501)).toBe('hot');
        expect(classifyBsr(15_000)).toBe('hot');
        expect(classifyBsr(60_000)).toBe('strong');
        expect(classifyBsr(250_000)).toBe('steady');
        expect(classifyBsr(250_001)).toBe('slow');
    });

    test('treats a missing rank as slow', () => {
        expect(classifyBsr(null)).toBe('slow');
        expect(classifyBsr(undefined)).toBe('slow');
        expect(classifyBsr(0)).toBe('slow');
    });
});

describe('tier ranges', () => {
    test('tiers tile the rank line without gaps', () => {
        expect(tierRankRange('elite')).toEqual({ min: 1, max: 2500 });
        expect(tierRankRange('hot')).toEqual({ min: 2501, max: 15_000 });
        expect(tierRankRange('slow')).toEqual({ min: 250_001, max: null });
    });

    test('a selection spans its outermost tiers', () => {
        expect(tierSalesRankSpan([])).toBeUndefined();
        expect(tierSalesRankSpan(['hot'])).toEqual({ min: 2501, max: 15_000 });
        expect(tierSalesRankSpan(['steady', 'elite'])).toEqual({ min: 1, max: 250_000 });
        expect(tierSalesRankSpan(['strong', 'slow'])).toEqual({ min: 15_001 });
    });
});

test('estimateMonthlySales falls with rank and never reaches zero', () => {
    expect(estimateMonthlySales(null)).toBeNull();
    expect(estimateMonthlySales(1840)).toBeGreaterThan(estimateMonthlySales(60_000) ?? 0);
    expect(estimateMonthlySales(5_000_000)).toBe(1);
});

describe('formatting', () => {
    test('ranks', () => {
        expect(formatBsr(1840)).toBe('#1,840');
        expect(formatBsr(null)).toBe('—');
        expect(formatBsrCompact(450_000)).toBe('#450K');
        expect(formatBsrCompact(1_240_000)).toBe('#1.2M');
        expect(formatBsrCompact(2500)).toBe('#2.5K');
    });

    test('prices', () => {
        expect(formatPrice({ amountMinor: 1999, currencyCode: 'USD' })).toBe('$19.99');
        expect(formatPrice(null)).toBeNull();
    });
});

describe('sparklineGeometry', () => {
    test('puts the better rank higher', () => {
        const geometry = sparklineGeometry(
            [
                { at: '2026-01-01T00:00:00Z', salesRank: 10_000 },
                { at: '2026-01-02T00:00:00Z', salesRank: 1000 },
            ],
            { height: 34, width: 72 }
        );
        expect(geometry?.end.y).toBe(3);
        expect(geometry?.xs).toEqual([3, 69]);
    });

    test('draws a flat line for one sample and nothing for none', () => {
        expect(sparklineGeometry([], { height: 34, width: 72 })).toBeNull();
        const single = sparklineGeometry([{ at: '2026-01-01T00:00:00Z', salesRank: 5 }], {
            height: 34,
            width: 72,
        });
        expect(single?.points).toBe('3.0,17.0 69.0,17.0');
    });

    test('nearestSampleIndex', () => {
        expect(nearestSampleIndex([3, 36, 69], 50)).toBe(1);
        expect(nearestSampleIndex([3, 36, 69], 60)).toBe(2);
    });
});

describe('rankStrength', () => {
    test('runs log-scale from #600 (full) to #6M (empty)', () => {
        expect(rankStrength(600)).toBe(1);
        expect(rankStrength(6_000_000)).toBe(0);
        expect(rankStrength(60_000)).toBeCloseTo(0.5);
        expect(rankStrength(null)).toBeNull();
    });
});
