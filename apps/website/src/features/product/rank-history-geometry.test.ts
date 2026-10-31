import { describe, expect, test } from 'bun:test';
import { RANK_CHART_INSET, rankChartGeometry } from './rank-history-geometry';

const size = { height: 300, width: 900 };

describe('rank chart geometry', () => {
    test('climbs for a better rank and spans the plot in time', () => {
        const geometry = rankChartGeometry(
            [
                { at: '2025-01-01T00:00:00Z', salesRank: 400_000 },
                { at: '2025-06-01T00:00:00Z', salesRank: 9_000 },
                { at: '2026-01-01T00:00:00Z', salesRank: 60_000 },
            ],
            size
        );
        if (!geometry) throw new Error('expected a drawing');
        const [oldest, best, latest] = geometry.points;
        expect(oldest?.x).toBe(RANK_CHART_INSET.left);
        expect(latest?.x).toBe(size.width - RANK_CHART_INSET.right);
        expect(best?.y).toBeLessThan(latest?.y ?? 0);
        expect(latest?.y).toBeLessThan(oldest?.y ?? 0);
        expect(geometry.best).toBe(1);
        expect(geometry.area.endsWith('Z')).toBe(true);
    });

    test('stacks the tier bands best first and labels the year in January', () => {
        const geometry = rankChartGeometry(
            [
                { at: '2024-11-01T00:00:00Z', salesRank: 2_000 },
                { at: '2026-10-01T00:00:00Z', salesRank: 2_000_000 },
            ],
            size
        );
        if (!geometry) throw new Error('expected a drawing');
        expect(geometry.bands.map(band => band.tier)).toEqual([
            'elite',
            'hot',
            'strong',
            'steady',
            'slow',
        ]);
        for (const [index, band] of geometry.bands.slice(1).entries()) {
            const above = geometry.bands[index];
            expect(band.y).toBeCloseTo((above?.y ?? 0) + (above?.height ?? 0), 1);
        }
        expect(geometry.xTicks.map(tick => tick.label)).toContain('2026');
    });

    test('draws one sample flat across and nothing without a rank', () => {
        const flat = rankChartGeometry([{ at: '2026-10-01T00:00:00Z', salesRank: 5_000 }], size);
        expect(flat?.points).toHaveLength(1);
        expect(flat?.line).toMatch(/^M44\.0 [\d.]+ L832\.0 [\d.]+$/);
        expect(rankChartGeometry([{ at: '2026-10-01T00:00:00Z', salesRank: 0 }], size)).toBeNull();
    });
});
