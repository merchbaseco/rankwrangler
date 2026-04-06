import { describe, expect, it } from 'bun:test';
import { mapTopSearchTermTrendRows } from '@/db/top-search-terms/trends.js';

describe('mapTopSearchTermTrendRows', () => {
    it('returns the latest observed date and normalized point values', () => {
        const mapped = mapTopSearchTermTrendRows([
            {
                latestObservedDate: '2026-04-01',
                observedDate: '2026-03-31',
                searchFrequencyRank: 42,
                clickShareTop3SumBasisPoints: 2418,
                conversionShareTop3SumBasisPoints: 212,
            },
            {
                latestObservedDate: '2026-04-01',
                observedDate: '2026-04-01',
                searchFrequencyRank: 39,
                clickShareTop3SumBasisPoints: 2500,
                conversionShareTop3SumBasisPoints: 240,
            },
        ]);

        expect(mapped).toEqual({
            latestObservedDate: '2026-04-01',
            points: [
                {
                    observedDate: '2026-03-31',
                    searchFrequencyRank: 42,
                    clickShareTop3Sum: 0.2418,
                    conversionShareTop3Sum: 0.0212,
                },
                {
                    observedDate: '2026-04-01',
                    searchFrequencyRank: 39,
                    clickShareTop3Sum: 0.25,
                    conversionShareTop3Sum: 0.024,
                },
            ],
        });
    });

    it('returns an empty result when no rows are available', () => {
        expect(mapTopSearchTermTrendRows([])).toEqual({
            latestObservedDate: null,
            points: [],
        });
    });
});
