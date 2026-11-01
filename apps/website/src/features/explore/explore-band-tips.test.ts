import { describe, expect, test } from 'bun:test';
import {
    bsrBucketTip,
    improvingTip,
    publishedDayTip,
    soldBucketTip,
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

    test('sold buckets read their badge range and count', () => {
        const buckets = [
            { count: 9_120, max: 100, min: 0 },
            { count: 1, max: 2_000, min: 1_000 },
            { count: 4, max: null, min: 50_000 },
        ];
        expect(soldBucketTip(buckets, 0)).toBe('9,120 designs · under 100/mo');
        expect(soldBucketTip(buckets, 1)).toBe('1 design · 1,000–1,999/mo');
        expect(soldBucketTip(buckets, 2)).toBe('4 designs · 50,000+/mo');
        expect(soldBucketTip(buckets, 3)).toBeNull();
    });
});
