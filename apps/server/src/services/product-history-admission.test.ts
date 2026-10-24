import { describe, expect, it } from 'bun:test';
import { getHistoryAdmissionForecast } from '@/services/product-history-admission';
import { getAutomaticHistoryDecision } from '@/services/product-history-eligibility';

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
    it('forecasts daily and weekly cohorts together against protected history flow', () => {
        expect(
            getHistoryAdmissionForecast({
                daily: 131,
                weekly: 448,
                productCost: 2,
                refillRate: 20,
            })
        ).toEqual({ projectedDailyTokens: 390, protectedDailyTokens: 12960 });
    });
});
