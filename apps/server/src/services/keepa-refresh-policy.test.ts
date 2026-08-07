import { describe, expect, it } from 'bun:test';
import {
    KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    KEEPA_FAILURE_RETRY_BASE_MS,
    KEEPA_FAILURE_RETRY_MAX_MS,
    KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS,
    getKeepaEnqueueMinRefreshIntervalMs,
    getKeepaFailureRetryDelayMs,
    getKeepaRefreshDecision,
    getKeepaRefreshPolicyBucketKey,
    isEligibleForKeepaHistoryRefresh,
} from '@/services/keepa-refresh-policy';

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

    it('keeps unknown classification distinct and out of automatic Merch refresh', () => {
        expect(getKeepaRefreshPolicyBucketKey(null, 1000)).toBe('unknown');
    });
});

describe('getKeepaFailureRetryDelayMs', () => {
    it('backs failed queue work off exponentially and caps it at one day', () => {
        expect(getKeepaFailureRetryDelayMs(1)).toBe(KEEPA_FAILURE_RETRY_BASE_MS);
        expect(getKeepaFailureRetryDelayMs(2)).toBe(KEEPA_FAILURE_RETRY_BASE_MS * 2);
        expect(getKeepaFailureRetryDelayMs(99)).toBe(KEEPA_FAILURE_RETRY_MAX_MS);
    });
});

describe('getKeepaRefreshDecision', () => {
    const now = new Date('2026-07-22T14:00:00.000Z');

    it('uses Product Keepa freshness for daily and weekly policy buckets', () => {
        expect(
            getKeepaRefreshDecision({
                isMerchListing: true,
                rootCategoryBsr: 200_000,
                keepaFetchedAt: new Date('2026-07-21T15:00:00.000Z'),
                now,
            })
        ).toEqual({ shouldRefresh: false, reason: 'fresh_product' });
        expect(
            getKeepaRefreshDecision({
                isMerchListing: true,
                rootCategoryBsr: 500_000,
                keepaFetchedAt: new Date('2026-07-15T13:59:59.000Z'),
                now,
            })
        ).toEqual({ shouldRefresh: true, reason: 'stale_product' });
    });

    it('treats a Product without accepted Keepa data as stale', () => {
        expect(
            getKeepaRefreshDecision({
                isMerchListing: true,
                rootCategoryBsr: 200_000,
                keepaFetchedAt: null,
                now,
            })
        ).toEqual({ shouldRefresh: true, reason: 'never_fetched' });
    });

    it('rejects Products outside the Keepa refresh policy', () => {
        expect(
            getKeepaRefreshDecision({
                isMerchListing: false,
                rootCategoryBsr: 200_000,
                keepaFetchedAt: null,
                now,
            })
        ).toEqual({ shouldRefresh: false, reason: 'not_eligible' });
        expect(
            getKeepaRefreshDecision({
                isMerchListing: null,
                rootCategoryBsr: 200_000,
                keepaFetchedAt: null,
                now,
            })
        ).toEqual({ shouldRefresh: false, reason: 'not_eligible' });
        expect(
            getKeepaRefreshDecision({
                isMerchListing: true,
                rootCategoryBsr: 1_000_000,
                keepaFetchedAt: null,
                now,
            })
        ).toEqual({ shouldRefresh: false, reason: 'not_eligible' });
    });
});

describe('isEligibleForKeepaHistoryRefresh', () => {
    it('returns true only for merch in an automatic refresh bucket', () => {
        expect(isEligibleForKeepaHistoryRefresh(true, 1)).toBeTrue();
        expect(isEligibleForKeepaHistoryRefresh(true, 999_999)).toBeTrue();
        expect(isEligibleForKeepaHistoryRefresh(true, 1_000_000)).toBeFalse();
    });

    it('returns false for non-merch or missing BSR', () => {
        expect(isEligibleForKeepaHistoryRefresh(false, 1)).toBeFalse();
        expect(isEligibleForKeepaHistoryRefresh(true, null)).toBeFalse();
    });
});

describe('getKeepaEnqueueMinRefreshIntervalMs', () => {
    it('returns a daily interval only below 300k', () => {
        expect(getKeepaEnqueueMinRefreshIntervalMs(true, 150000)).toBe(
            KEEPA_DAILY_ENQUEUE_MIN_REFRESH_INTERVAL_MS
        );
    });

    it('returns a weekly interval for 300k to <1M bucket', () => {
        expect(getKeepaEnqueueMinRefreshIntervalMs(true, 500000)).toBe(
            KEEPA_WEEKLY_ENQUEUE_MIN_REFRESH_INTERVAL_MS
        );
    });

    it('returns null for on-demand, non-merch, or missing-BSR Products', () => {
        expect(getKeepaEnqueueMinRefreshIntervalMs(true, 1_000_000)).toBeNull();
        expect(getKeepaEnqueueMinRefreshIntervalMs(false, 100)).toBeNull();
        expect(getKeepaEnqueueMinRefreshIntervalMs(true, null)).toBeNull();
    });
});
