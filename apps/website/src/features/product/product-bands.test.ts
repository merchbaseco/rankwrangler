import { describe, expect, test } from 'bun:test';
import { dailyDrops, dailyRanks, monthlyBest } from './product-bands';

const now = Date.parse('2026-10-30T15:00:00Z');
const point = (at: string, salesRank: number) => ({ at, salesRank });

describe('product KPI bands', () => {
    test('samples the rank at each day close, carried forward, from the first change point', () => {
        const series = [
            point('2026-10-29T08:00:00Z', 9_000),
            point('2026-10-27T10:00:00Z', 20_000),
            point('2026-10-30T09:00:00Z', 4_000),
            point('2026-10-30T12:00:00Z', 0),
        ];
        expect(dailyRanks(series, 5, now)).toEqual([
            point('2026-10-27T23:59:59.999Z', 20_000),
            point('2026-10-28T23:59:59.999Z', 20_000),
            point('2026-10-29T23:59:59.999Z', 9_000),
            point('2026-10-30T23:59:59.999Z', 4_000),
        ]);
    });

    test('keeps each month’s best rank', () => {
        const series = [
            point('2026-09-02T00:00:00Z', 50_000),
            point('2026-09-20T00:00:00Z', 12_000),
            point('2026-10-26T00:00:00Z', 4_059),
            point('2026-10-30T00:00:00Z', 14_153),
        ];
        expect(monthlyBest(series)).toEqual([
            point('2026-09-01T00:00:00.000Z', 12_000),
            point('2026-10-01T00:00:00.000Z', 4_059),
        ]);
    });

    test('counts improving change points per day inside the window', () => {
        const series = [
            point('2026-10-26T12:00:00Z', 30_000),
            point('2026-10-28T01:00:00Z', 20_000),
            point('2026-10-28T05:00:00Z', 25_000),
            point('2026-10-28T09:00:00Z', 15_000),
            point('2026-10-30T02:00:00Z', 9_000),
        ];
        expect(dailyDrops(series, 3, now).map(day => day.drops)).toEqual([2, 0, 1]);
    });
});
