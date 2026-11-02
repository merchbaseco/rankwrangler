import { describe, expect, it } from 'bun:test';
import { dateToKeepaMinute } from './keepa-history-series';
import {
    bucketSeasonality,
    SEASONALITY_WEEKS,
    type SeasonalitySeries,
    seasonalityStart,
} from './search-seasonality';

/** Sales a week equal to the rank, so sums read back directly. */
const identity = (bsr: number) => bsr;
// A Tuesday afternoon: the rolling year ends at Tuesday's midnight, 52 weeks after 2025-01-21.
const now = new Date('2026-01-20T12:00:00Z');

describe('bucketSeasonality', () => {
    it('covers the last 52 whole weeks, oldest first, ending today', () => {
        expect(seasonalityStart(now).toISOString()).toBe('2025-01-21T00:00:00.000Z');
        const result = bucketSeasonality(
            [series([['2024-06-01T00:00:00Z', 100]])],
            identity,
            now
        );
        expect(result?.weeks).toHaveLength(SEASONALITY_WEEKS);
        expect(result?.weeks[0]).toEqual({ start: '2025-01-21', sales: 100, designs: 1 });
        expect(result?.weeks.at(-1)?.start).toBe('2026-01-13');
    });

    it('reads the rank in force at each week end', () => {
        const result = bucketSeasonality(
            [
                series([
                    ['2025-01-01T00:00:00Z', 100],
                    // Superseded before the first week (Jan 21–27) ends, so only 300 counts.
                    ['2025-01-22T00:00:00Z', 200],
                    ['2025-01-27T23:59:00Z', 300],
                    ['2025-01-28T00:00:00Z', 400],
                ]),
            ],
            identity,
            now
        );
        expect(result?.weeks[0]?.sales).toBe(300);
        expect(result?.weeks[1]?.sales).toBe(400);
        expect(result?.sampled).toBe(1);
    });

    it('leaves out weeks before the first point and without a rank', () => {
        const result = bucketSeasonality(
            [
                series([
                    ['2025-12-20T00:00:00Z', 50],
                    ['2026-01-10T00:00:00Z', -1],
                ]),
            ],
            identity,
            now
        );
        const weeks = result?.weeks ?? [];
        // Dec 16–22 ends with 50 in force; Dec 9–15 had no point yet; Jan 6–12 ends rankless.
        expect(weeks.find(week => week.start === '2025-12-09')).toMatchObject({ sales: null });
        expect(weeks.find(week => week.start === '2025-12-16')).toMatchObject({ sales: 50 });
        expect(weeks.find(week => week.start === '2026-01-06')).toEqual({
            start: '2026-01-06',
            sales: null,
            designs: 0,
        });
    });

    it('sums designs per week and counts only those that contributed', () => {
        const result = bucketSeasonality(
            [
                series([['2025-06-01T00:00:00Z', 10]]),
                series([['2025-06-01T00:00:00Z', 20]]),
                series([]),
            ],
            identity,
            now
        );
        expect(result?.sampled).toBe(2);
        expect(result?.weeks.at(-1)).toMatchObject({ sales: 30, designs: 2 });
    });

    it('is null when no design has a rank in the window', () => {
        // Stamped today, after the last whole week ended.
        expect(bucketSeasonality([series([['2026-01-20T06:00:00Z', 5]])], identity, now)).toBe(
            null
        );
        expect(bucketSeasonality([], identity, now)).toBeNull();
    });
});

const series = (points: readonly (readonly [string, number])[]): SeasonalitySeries => ({
    keepaMinutes: points.map(([at]) => dateToKeepaMinute(new Date(at))),
    values: points.map(([, value]) => value),
});
