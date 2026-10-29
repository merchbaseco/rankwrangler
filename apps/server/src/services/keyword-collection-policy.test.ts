import { describe, expect, it } from 'bun:test';
import {
    explorationCheckpoint,
    passPageLimit,
    KEYWORD_DAY_MS,
    keywordRetryAt,
    nextKeywordObservation,
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
                page: 9,
                nextPage: 9,
                contiguousPages: 9,
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
    it('limits pass depth by Brand Analytics popularity', () => {
        expect(passPageLimit(null)).toBe(10);
        expect(passPageLimit(1)).toBe(10);
        expect(passPageLimit(100_000)).toBe(10);
        expect(passPageLimit(100_001)).toBe(5);
        expect(passPageLimit(1_000_000)).toBe(5);
        expect(passPageLimit(1_000_001)).toBe(3);
        const page = (pageLimit: number) =>
            explorationCheckpoint({
                page: 2,
                nextPage: 2,
                contiguousPages: 2,
                lowYieldPages: 0,
                newMerchCount: 12,
                resultCount: 20,
                pageLimit,
            }).stopReason;
        expect(page(3)).toBe('pageLimit');
        expect(page(5)).toBe('running');
    });
});
