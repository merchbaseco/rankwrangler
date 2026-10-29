import { describe, expect, test } from 'bun:test';
import { formatAge, formatSold, weekMove } from './explore-rows';

const day = (offset: number, salesRank: number) => ({
    at: new Date(Date.UTC(2026, 9, 27) - offset * 86_400_000).toISOString(),
    salesRank,
});

describe('explore rows', () => {
    test('the seven-day move compares the latest sample with the one a week back', () => {
        const series = [day(9, 9000), day(7, 10_000), day(3, 7000), day(0, 5000)];
        expect(weekMove(series)).toBe(50);
    });

    test('a worse rank is a negative move', () => {
        expect(weekMove([day(7, 1000), day(0, 1500)])).toBe(-50);
    });

    test('no sample within a day of a week back means no move', () => {
        expect(weekMove([day(3, 1000), day(0, 900)])).toBeNull();
        expect(weekMove([])).toBeNull();
    });

    test('ages format for the dense table', () => {
        expect(formatAge(412)).toBe('1.1y');
        expect(formatAge(60)).toBe('60d');
        expect(formatAge(null)).toBe('—');
    });

    test('sold a month: buckets get a plus, exact figures and estimates do not', () => {
        expect(formatSold({ isEstimate: false, value: 900 })).toBe('900+');
        expect(formatSold({ isEstimate: false, value: 1000 })).toBe('1K+');
        expect(formatSold({ isEstimate: false, value: 50 })).toBe('50+');
        expect(formatSold({ isEstimate: false, value: 781 })).toBe('781');
        expect(formatSold({ isEstimate: true, value: 1149 })).toBe('~1,149');
    });
});
