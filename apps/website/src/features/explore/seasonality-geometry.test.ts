import { describe, expect, test } from 'bun:test';
import {
    type Season,
    seasonGeometry,
    seasonPeakWeek,
    seasonStrength,
    seasonWeekAt,
    seasonWeekLabel,
} from './seasonality-geometry';

describe('keyword seasonality geometry', () => {
    test('strength is sales per design as a share of the busiest week, smoothed', () => {
        const strength = seasonStrength([
            week('2025-11-04', 300, 3),
            week('2025-11-11', 1200, 6),
            week('2025-11-18', 900, 3),
            week('2025-11-25', null, 0),
        ]);
        expect(strength[0]).toBe(50);
        expect(strength[1]).toBeCloseTo(66.67, 1);
        expect(strength[2]).toBeCloseTo(83.33, 1);
        expect(strength[3]).toBeNull();
    });

    test('a week without data breaks the line instead of dropping to zero', () => {
        const geometry = seasonGeometry(
            season([
                week('2025-12-23', 10, 1),
                week('2025-12-30', 10, 1),
                week('2026-01-06', null, 0),
                week('2026-01-13', 10, 1),
                week('2026-01-20', 10, 1),
            ]),
            { height: 100, width: 500 }
        );
        expect(geometry.line.match(/M/g)).toHaveLength(2);
        // A new year is labelled with the year rather than "Jan".
        expect(geometry.xTicks.map(tick => tick.label)).toEqual(['2026']);
    });

    test('the pointer maps to a week, clamped to the series', () => {
        const geometry = seasonGeometry(
            season([week('2026-01-06', 1, 1), week('2026-01-13', 1, 1)]),
            { height: 100, width: 104 }
        );
        expect(seasonWeekAt(10, geometry)).toBe(0);
        expect(seasonWeekAt(90, geometry)).toBe(1);
        expect(seasonWeekAt(900, geometry)).toBe(1);
        expect(seasonWeekAt(-10, geometry)).toBe(0);
    });

    test('the peak is the busiest week per design', () => {
        const busiest = week('2025-11-18', 900, 2);
        expect(
            seasonPeakWeek(season([week('2025-11-11', 1000, 10), busiest, week('2025-11-25', null, 0)]))
        ).toBe(busiest);
        expect(seasonPeakWeek(season([]))).toBeNull();
    });

    test('weeks read as their first day', () => {
        expect(seasonWeekLabel('2025-11-19')).toBe('Nov 19');
        expect(seasonWeekLabel('2025-11-19', true)).toBe('Nov 19, 2025');
    });
});

const week = (start: string, sales: number | null, designs: number) => ({ designs, sales, start });

const season = (weeks: Season['weeks']): Season => ({ sampled: 1, weeks });
