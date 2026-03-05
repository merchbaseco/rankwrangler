import { describe, expect, it } from 'bun:test';
import {
    calculateSearchTermsTrendDeltas,
    clampTrendRangeDays,
    getTrendStartDate,
} from '@/services/top-search-terms-trend.js';

describe('calculateSearchTermsTrendDeltas', () => {
    it('computes rank/share deltas from latest point against 1d/7d/30d anchors', () => {
        const deltas = calculateSearchTermsTrendDeltas([
            {
                observedDate: '2026-02-01',
                searchFrequencyRank: 150,
                clickShareTop3Sum: 0.05,
                conversionShareTop3Sum: 0.01,
            },
            {
                observedDate: '2026-02-02',
                searchFrequencyRank: 100,
                clickShareTop3Sum: 0.1,
                conversionShareTop3Sum: 0.02,
            },
            {
                observedDate: '2026-02-24',
                searchFrequencyRank: 70,
                clickShareTop3Sum: 0.18,
                conversionShareTop3Sum: 0.04,
            },
            {
                observedDate: '2026-03-02',
                searchFrequencyRank: 52,
                clickShareTop3Sum: 0.2,
                conversionShareTop3Sum: 0.05,
            },
            {
                observedDate: '2026-03-03',
                searchFrequencyRank: 50,
                clickShareTop3Sum: 0.25,
                conversionShareTop3Sum: 0.06,
            },
        ]);

        expect(deltas).toEqual({
            d1: {
                rankDelta: 2,
                clickShareDelta: 0.05,
                conversionShareDelta: 0.01,
            },
            d7: {
                rankDelta: 20,
                clickShareDelta: 0.07,
                conversionShareDelta: 0.02,
            },
            d30: {
                rankDelta: 100,
                clickShareDelta: 0.2,
                conversionShareDelta: 0.05,
            },
        });
    });

    it('returns null deltas when no historical anchor exists', () => {
        const deltas = calculateSearchTermsTrendDeltas([
            {
                observedDate: '2026-03-03',
                searchFrequencyRank: 50,
                clickShareTop3Sum: 0.25,
                conversionShareTop3Sum: 0.06,
            },
        ]);

        expect(deltas.d1.rankDelta).toBeNull();
        expect(deltas.d7.clickShareDelta).toBeNull();
        expect(deltas.d30.conversionShareDelta).toBeNull();
    });
});

describe('clampTrendRangeDays', () => {
    it('bounds range to [7, 365] and defaults invalid values to 90', () => {
        expect(clampTrendRangeDays(Number.NaN)).toBe(90);
        expect(clampTrendRangeDays(3)).toBe(7);
        expect(clampTrendRangeDays(30.8)).toBe(30);
        expect(clampTrendRangeDays(999)).toBe(365);
    });
});

describe('getTrendStartDate', () => {
    it('returns inclusive start date based on latest observed date and range', () => {
        expect(
            getTrendStartDate({
                latestObservedDate: '2026-03-03',
                days: 7,
            })
        ).toBe('2026-02-25');
    });
});
