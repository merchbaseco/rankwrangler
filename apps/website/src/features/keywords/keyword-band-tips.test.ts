import { describe, expect, test } from 'bun:test';
import { minedTip, queueTip, scoreBucketTip, shelfBsrTip } from './keyword-band-tips';

describe('keyword band tooltips', () => {
    test('score buckets read their range, heat and count', () => {
        const buckets = [
            { bucketMax: 75, count: 4, heat: 'warm' },
            { bucketMax: 80, count: 9, heat: 'hot' },
        ];
        expect(scoreBucketTip(buckets, 1)).toBe('75–80 · Hot · 9 keywords');
        expect(scoreBucketTip(buckets, 0)).toBe('0–75 · Warm · 4 keywords');
    });

    test('meters say their figure and what it counts', () => {
        expect(minedTip(6, 13)).toBe('6 of 13 keywords mined in the last 24h');
        expect(shelfBsrTip(13_000)).toBe('#13,000 median shelf BSR · Hot');
        expect(queueTip({ needsSync: 3, syncing: 1, total: 13, trials: 0 })).toBe(
            '3 need sync · 1 syncing, of 13 keywords'
        );
        expect(queueTip({ needsSync: 1, syncing: 0, total: 13, trials: 40 })).toBe(
            '1 needs sync · 0 syncing, of 13 keywords · 40 trials awaiting check'
        );
    });
});
