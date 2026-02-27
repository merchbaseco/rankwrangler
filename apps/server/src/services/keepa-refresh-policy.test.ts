import { describe, expect, it } from 'bun:test';
import {
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    getKeepaEnqueueMinRefreshIntervalMs,
    getKeepaRefreshPolicyBucketKey,
    isEligibleForKeepaHistoryRefresh,
} from '@/services/keepa-refresh-policy.js';

describe('getKeepaRefreshPolicyBucketKey', () => {
    it('classifies merch BSR under 300k as daily', () => {
        expect(getKeepaRefreshPolicyBucketKey(true, 299999)).toBe('daily');
    });

    it('classifies merch BSR 300k to under 1M as weekly', () => {
        expect(getKeepaRefreshPolicyBucketKey(true, 300000)).toBe('weekly');
        expect(getKeepaRefreshPolicyBucketKey(true, 999999)).toBe('weekly');
    });

    it('classifies merch BSR at or above 1M as on-demand', () => {
        expect(getKeepaRefreshPolicyBucketKey(true, 1000000)).toBe('onDemand');
    });

    it('classifies merch without numeric BSR as merchMissingBsr', () => {
        expect(getKeepaRefreshPolicyBucketKey(true, null)).toBe('merchMissingBsr');
    });

    it('classifies non-merch as nonMerch', () => {
        expect(getKeepaRefreshPolicyBucketKey(false, 1000)).toBe('nonMerch');
    });
});

describe('isEligibleForKeepaHistoryRefresh', () => {
    it('returns true for merch with numeric BSR including >= 1M', () => {
        expect(isEligibleForKeepaHistoryRefresh(true, 1)).toBeTrue();
        expect(isEligibleForKeepaHistoryRefresh(true, 1000000)).toBeTrue();
    });

    it('returns false for non-merch or missing BSR', () => {
        expect(isEligibleForKeepaHistoryRefresh(false, 1)).toBeFalse();
        expect(isEligibleForKeepaHistoryRefresh(true, null)).toBeFalse();
    });
});

describe('getKeepaEnqueueMinRefreshIntervalMs', () => {
    it('returns a daily interval for <300k and >=1M buckets', () => {
        expect(getKeepaEnqueueMinRefreshIntervalMs(true, 150000)).toBe(
            KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS
        );
        expect(getKeepaEnqueueMinRefreshIntervalMs(true, 1500000)).toBe(
            KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS
        );
    });

    it('returns a weekly interval for 300k to <1M bucket', () => {
        expect(getKeepaEnqueueMinRefreshIntervalMs(true, 500000)).toBe(
            KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS
        );
    });

    it('returns null for non-merch or missing BSR', () => {
        expect(getKeepaEnqueueMinRefreshIntervalMs(false, 100)).toBeNull();
        expect(getKeepaEnqueueMinRefreshIntervalMs(true, null)).toBeNull();
    });
});
