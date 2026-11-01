import { describe, expect, test } from 'bun:test';
import { accuracyRows, accuracySummary, formatGap } from './sales-curve-model';

const range = (min: number, max: number, badged: number, expectedShare: number) => ({
    badged,
    expectedShare,
    max,
    min,
    products: 100,
});

describe('sales curve accuracy', () => {
    test('rows carry the gap in points and its status', () => {
        const rows = accuracyRows([
            range(100_000, 150_000, 86, 0.87),
            range(500_000, 700_000, 20, 0.31),
            range(700_000, 1_000_000, 10, 0.3),
        ]);
        expect(rows.map(row => [row.label, row.gap, row.status])).toEqual([
            ['#100K–150K', -1, 'onTrack'],
            ['#500K–700K', -11, 'watch'],
            ['#700K–1M', -20, 'off'],
        ]);
        expect(accuracySummary(rows)).toBe('1 of 3 rank ranges on track');
        expect(accuracySummary([])).toBeNull();
    });

    test('gaps read signed in points', () => {
        expect(formatGap(7)).toBe('+7 pts');
        expect(formatGap(-9)).toBe('−9 pts');
        expect(formatGap(0)).toBe('none');
    });
});
