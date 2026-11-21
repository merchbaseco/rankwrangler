import { describe, expect, it } from 'bun:test';
import { getHistoryAdmissionForecast } from '@/services/product-history-admission';
import { getAutomaticHistoryDecision } from '@/services/product-history-eligibility';
import {
    getHistoryAdmissionOverload,
    KEEPA_ADMISSION_OVERLOAD_MIN_OVERDUE,
} from '@/services/product-history-overload';

const now = new Date('2026-10-23T12:00:00Z');
const product = {
    isMerchListing: true,
    rootCategoryBsr: 200_000,
    keepaFetchedAt: null,
    amazonListingStatus: 'active' as const,
    historyAdmissionState: 'admitted' as const,
};

describe('standing history admission', () => {
    it('keeps grandfathered never-fetched daily Merch identities eligible', () => {
        expect(getAutomaticHistoryDecision(product, now)).toEqual({
            shouldRefresh: true,
            reason: 'never_fetched',
        });
    });
    it('does not admit a newly discovered product or incidental keyword history', () => {
        for (const historyAdmissionState of ['notAdmitted', 'paused'] as const) {
            expect(getAutomaticHistoryDecision({ ...product, historyAdmissionState }, now)).toEqual(
                { shouldRefresh: false, reason: 'not_admitted' }
            );
        }
    });
    it('excludes deleted and non-Merch products even when grandfathered', () => {
        expect(
            getAutomaticHistoryDecision({ ...product, amazonListingStatus: 'deleted' }, now)
        ).toEqual({ shouldRefresh: false, reason: 'not_eligible' });
        expect(getAutomaticHistoryDecision({ ...product, isMerchListing: false }, now)).toEqual({
            shouldRefresh: false,
            reason: 'not_eligible',
        });
    });
    it('retains weekly cadence and freshness without automatic million-BSR work', () => {
        expect(
            getAutomaticHistoryDecision(
                {
                    ...product,
                    rootCategoryBsr: 500_000,
                    keepaFetchedAt: new Date('2026-10-20T12:00:00Z'),
                },
                now
            )
        ).toEqual({ shouldRefresh: false, reason: 'fresh_product' });
        expect(
            getAutomaticHistoryDecision({ ...product, rootCategoryBsr: 1_000_000 }, now)
        ).toEqual({ shouldRefresh: false, reason: 'not_eligible' });
    });
    it('forecasts daily, two-day, weekly and 14-day cohorts against 90% of the daily refill', () => {
        expect(
            getHistoryAdmissionForecast({
                twiceDaily: 10,
                daily: 120,
                weekly: 70,
                biweekly: 280,
                productCost: 2,
                refillRate: 20,
            })
        ).toEqual({ projectedDailyTokens: 200, protectedDailyTokens: 25920 });
    });
    it('does not pause admission for isolated stuck rows, but pauses on a real 7-day backlog', () => {
        const eightDaysAgo = new Date(now.getTime() - 8 * 86_400_000);
        expect(
            getHistoryAdmissionOverload(
                { historyOverdue: 6, historyOldestOverdueAt: eightDaysAgo },
                now
            )
        ).toEqual({
            overdueCount: 6,
            oldestOverdueAt: eightDaysAgo,
            newAdmissionsPaused: false,
        });
        expect(
            getHistoryAdmissionOverload(
                {
                    historyOverdue: KEEPA_ADMISSION_OVERLOAD_MIN_OVERDUE,
                    historyOldestOverdueAt: eightDaysAgo,
                },
                now
            ).newAdmissionsPaused
        ).toBe(true);
    });
});
