import { describe, expect, it } from 'bun:test';
import { formatAgo, priceTrendLabel, rankChangeVsAverage } from './product-format';
import { rankDomain, rankTicks, tierBands, timeTicks } from './rank-history-axis';

const now = Date.parse('2026-10-27T12:00:00.000Z');

describe('formatAgo', () => {
    it('compacts elapsed time to one unit', () => {
        expect(formatAgo('2026-10-27T11:59:40.000Z', now)).toBe('now');
        expect(formatAgo('2026-10-27T11:55:00.000Z', now)).toBe('5m');
        expect(formatAgo('2026-10-27T10:00:00.000Z', now)).toBe('2h');
        expect(formatAgo('2026-10-24T12:00:00.000Z', now)).toBe('3d');
        expect(formatAgo('2026-09-01T12:00:00.000Z', now)).toBe('8w');
    });
});

describe('rankChangeVsAverage', () => {
    it('reads a lower rank than the average as an improvement', () => {
        expect(rankChangeVsAverage(1840, 2970)).toBe(38);
        expect(rankChangeVsAverage(4000, 2000)).toBe(-100);
    });

    it('is null without both figures', () => {
        expect(rankChangeVsAverage(null, 2970)).toBeNull();
        expect(rankChangeVsAverage(1840, null)).toBeNull();
    });
});

describe('priceTrendLabel', () => {
    it('reports a flat or moved price over the window', () => {
        expect(priceTrendLabel([1999, 1999, 1999], 'USD', '90d')).toBe('flat 90d');
        expect(priceTrendLabel([1799, 1999], 'USD', '90d')).toBe('+$2.00 · 90d');
        expect(priceTrendLabel([2199, 1999], 'USD', '90d')).toBe('−$2.00 · 90d');
    });

    it('needs two samples and a currency', () => {
        expect(priceTrendLabel([1999], 'USD', '90d')).toBeNull();
        expect(priceTrendLabel([1999, 1999], null, '90d')).toBeNull();
    });
});

describe('rank history axis', () => {
    it('pads the domain and ticks on powers of ten', () => {
        const domain = rankDomain([612, 300_000]);
        expect(domain).toEqual([382, 480_000]);
        expect(rankTicks(domain)).toEqual([1000, 10_000, 100_000]);
    });

    it('clips tier bands to the domain', () => {
        expect(tierBands([2000, 20_000])).toEqual([
            { tier: 'elite', y1: 2000, y2: 2500 },
            { tier: 'hot', y1: 2501, y2: 15_000 },
            { tier: 'strong', y1: 15_001, y2: 20_000 },
        ]);
    });

    it('ticks month starts for long spans and weeks for short ones', () => {
        const start = Date.parse('2025-10-15T00:00:00.000Z');
        const end = Date.parse('2026-01-20T00:00:00.000Z');
        expect(timeTicks(start, end).map(tick => new Date(tick).toISOString())).toEqual([
            '2025-11-01T00:00:00.000Z',
            '2025-12-01T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z',
        ]);
        expect(timeTicks(end - 30 * 86_400_000, end)).toHaveLength(4);
    });
});
