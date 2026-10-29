import { describe, expect, test } from 'bun:test';
import {
    bsrBucketTip,
    improvingTip,
    publishedDayTip,
    soldBins,
    soldBinTip,
} from './explore-band-tips';

describe('explore band tooltips', () => {
    test('BSR buckets read their rank range, tier and count', () => {
        const buckets = [
            { bucketMax: 2500, count: 3, tier: 'elite' as const },
            { bucketMax: 4000, count: 12, tier: 'hot' as const },
            { bucketMax: 5_000_000, count: 1, tier: 'slow' as const },
        ];
        expect(bsrBucketTip(buckets, 1)).toBe('#2,501–#4,000 · Hot · 12 designs');
        expect(bsrBucketTip(buckets, 2)).toBe('#4,001+ · Slow · 1 design');
        expect(bsrBucketTip(buckets, 9)).toBeNull();
    });

    test('a published day reads its date and count', () => {
        expect(publishedDayTip([{ count: 3, day: '2026-10-21' }], 0)).toBe('Oct 21 · 3 published');
    });

    test('the improving meter says what it counts', () => {
        expect(improvingTip(0.38)).toBe('38% of results ranked better than 7 days ago');
    });

    test('sold bins cover the page on a log scale', () => {
        const bins = soldBins([1, 10, 100, 1000], 4);
        expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
        expect(soldBinTip(bins, 3)).toMatch(/^1 design · ~/);
    });
});
