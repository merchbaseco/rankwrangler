import { describe, expect, it } from 'bun:test';
import {
    DROPPED_POPULAR_MAX_PAGES,
    explorationCheckpoint,
    isBrandAnalyticsRankSurge,
    KEYWORD_DAY_MS,
    keywordRetryAt,
    nextKeywordObservation,
    PASS_MAX_PAGES,
    passPageLimit,
} from './keyword-collection-policy';

const now = new Date('2026-10-23T12:00:00Z');
const base = {
    tier: 'warm' as const,
    intervalDays: 14,
    previousMerchIds: ['a', 'b', 'c', 'd', 'e'],
    currentMerchIds: ['a', 'b', 'c', 'd', 'e'],
    emptyCount: 0,
    resultCount: 5,
    now,
    random: () => 0.5,
};
describe('keyword collection policy', () => {
    it('shortens changed heads, lengthens quiet heads, and leaves thin cohorts neutral', () => {
        expect(
            nextKeywordObservation({ ...base, currentMerchIds: ['a', 'b', 'f', 'g', 'h'] })
                .intervalDays
        ).toBe(7);
        expect(nextKeywordObservation(base).intervalDays).toBe(21);
        expect(nextKeywordObservation({ ...base, previousMerchIds: ['a'] }).intervalDays).toBe(14);
    });
    it('separates successful negatives from exponential technical retry', () => {
        expect(
            nextKeywordObservation({ ...base, resultCount: 0 }).nextDueAt.getTime() - now.getTime()
        ).toBe(7 * KEYWORD_DAY_MS);
        expect(
            nextKeywordObservation({ ...base, resultCount: 0, emptyCount: 1 }).nextDueAt.getTime() -
                now.getTime()
        ).toBe(30 * KEYWORD_DAY_MS);
        expect(keywordRetryAt(0, now).getTime() - now.getTime()).toBe(300_000);
        expect(keywordRetryAt(1, now).getTime() - now.getTime()).toBe(600_000);
        expect(keywordRetryAt(30, now).getTime() - now.getTime()).toBe(KEYWORD_DAY_MS);
        expect(keywordRetryAt(0, now, 900_000).getTime() - now.getTime()).toBe(900_000);
    });
    it('allows the initial two page sample and continues past job depth five', () => {
        expect(
            explorationCheckpoint({
                page: 0,
                nextPage: 0,
                contiguousPages: 0,
                lowYieldPages: 0,
                newMerchCount: 0,
                resultCount: 20,
            }).stopReason
        ).toBe('running');
        expect(
            explorationCheckpoint({
                page: 1,
                nextPage: 1,
                contiguousPages: 1,
                lowYieldPages: 1,
                newMerchCount: 1,
                resultCount: 20,
            }).stopReason
        ).toBe('lowYield');
        expect(
            explorationCheckpoint({
                page: 6,
                nextPage: 6,
                contiguousPages: 6,
                lowYieldPages: 0,
                newMerchCount: 4,
                resultCount: 20,
            })
        ).toMatchObject({ nextPage: 7, contiguousPages: 7, stopReason: 'running' });
        expect(
            explorationCheckpoint({
                page: PASS_MAX_PAGES - 1,
                nextPage: PASS_MAX_PAGES - 1,
                contiguousPages: PASS_MAX_PAGES - 1,
                lowYieldPages: 0,
                newMerchCount: 12,
                resultCount: 20,
            }).stopReason
        ).toBe('pageLimit');
    });
    it('does not manufacture contiguous coverage across gaps', () => {
        expect(
            explorationCheckpoint({
                page: 4,
                nextPage: 4,
                contiguousPages: 2,
                lowYieldPages: 0,
                newMerchCount: 5,
                resultCount: 20,
            }).contiguousPages
        ).toBe(2);
    });
    it('uses a yield-driven ceiling for tracked passes and caps dropped trials by BA rank', () => {
        expect(PASS_MAX_PAGES).toBe(20);
        expect(passPageLimit('tracked', null)).toBe(20);
        expect(passPageLimit('tracked', 2_000_000)).toBe(20);
        expect(passPageLimit('trial', 1_500_000)).toBe(20);
        expect(passPageLimit('dropped', 50_000)).toBe(DROPPED_POPULAR_MAX_PAGES);
        expect(passPageLimit('dropped', 100_000)).toBe(DROPPED_POPULAR_MAX_PAGES);
        expect(passPageLimit('dropped', 100_001)).toBe(1);
        expect(passPageLimit('dropped', null)).toBe(1);
        const page = (pageLimit: number) =>
            explorationCheckpoint({
                page: 4,
                nextPage: 4,
                contiguousPages: 4,
                lowYieldPages: 0,
                newMerchCount: 12,
                resultCount: 20,
                pageLimit,
            }).stopReason;
        expect(page(5)).toBe('pageLimit');
        expect(page(20)).toBe('running');
    });
    it('detects seasonal Brand Analytics rank surges into the top 100k', () => {
        expect(
            isBrandAnalyticsRankSurge({
                previousRank: 200_000,
                newRank: 80_000,
                previousWeek: '2026-10-18',
                newWeek: '2026-10-25',
            })
        ).toBe(true);
        expect(
            isBrandAnalyticsRankSurge({
                previousRank: 120_000,
                newRank: 80_000,
                previousWeek: '2026-10-18',
                newWeek: '2026-10-25',
            })
        ).toBe(false);
        expect(
            isBrandAnalyticsRankSurge({
                previousRank: 90_000,
                newRank: 85_000,
                previousWeek: '2026-08-01',
                newWeek: '2026-10-25',
            })
        ).toBe(true);
        expect(
            isBrandAnalyticsRankSurge({
                previousRank: 500_000,
                newRank: 150_000,
                previousWeek: '2026-10-18',
                newWeek: '2026-10-25',
            })
        ).toBe(false);
        expect(
            isBrandAnalyticsRankSurge({
                previousRank: 200_000,
                newRank: 50_000,
                previousWeek: '2026-10-25',
                newWeek: '2026-10-25',
            })
        ).toBe(false);
    });
});
