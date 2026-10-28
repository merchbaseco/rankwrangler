import { describe, it, expect } from 'bun:test';
import {
    keywordPopularity,
    MIN_MERCH_ON_FIRST_PAGE,
    nextKeywordStanding,
    nextKeywordTracking,
} from './keyword-standing-policy';
const now = new Date('2026-10-26T12:00:00Z');
const score = (ranks: (number | null)[]) => keywordPopularity({ ranks, now });
describe('keyword importance and cadence', () => {
    it('requires breadth to turn one exceptional product into a hot niche', () => {
        expect(score([10_000])).toMatchObject({ score: 52, tier: 'warm' });
        expect(score([100_000, 100_000, 100_000])).toMatchObject({ score: 76, tier: 'hot' });
        expect(score([300_000, 300_000, 300_000, 300_000, 300_000])).toMatchObject({
            score: 52,
            tier: 'warm',
        });
        expect(score([2_000_000, 3_000_000])).toMatchObject({ score: 0, tier: 'cold' });
        expect(score([null, null])).toMatchObject({ score: null, tier: 'unrated' });
    });
    it('keeps established niches warm without depending on new-product yield', () => {
        const input = {
            previousTier: 'hot' as const,
            proposedTier: 'hot' as const,
            intervalDays: 2,
            previousIds: ['a', 'b', 'c'],
            currentIds: ['a', 'b', 'c'],
            emptyCount: 0,
            resultCount: 20,
            demotionObservedAt: new Date(now.getTime() - 30 * 86_400_000),
            demotionCount: 0,
            now,
            random: () => 0.5,
        };
        expect(nextKeywordStanding(input)).toMatchObject({ tier: 'hot', intervalDays: 3 });
        expect(nextKeywordStanding({ ...input, proposedTier: 'cold' }).tier).toBe('hot');
        expect(nextKeywordStanding({ ...input, proposedTier: 'cold', demotionCount: 1 }).tier).toBe(
            'cold'
        );
        expect(
            nextKeywordStanding({
                ...input,
                proposedTier: 'cold',
                demotionCount: 1,
                demotionObservedAt: now,
            }).tier
        ).toBe('hot');
        expect(nextKeywordStanding({ ...input, proposedTier: 'unrated' }).tier).toBe('hot');
    });
    it('starts demotion grace when weak evidence begins, not when the keyword was created', () => {
        const next = nextKeywordStanding({
            previousTier: 'hot',
            proposedTier: 'cold',
            intervalDays: 2,
            previousIds: ['a', 'b', 'c'],
            currentIds: ['a', 'b', 'c'],
            emptyCount: 0,
            resultCount: 20,
            demotionObservedAt: null,
            demotionCount: 0,
            now,
            random: () => 0.5,
        });
        expect(next).toMatchObject({ tier: 'hot', demotionCount: 1, demotionObservedAt: now });
    });
});
describe('trial admission', () => {
    const trial = (merchOnFirstPage: number, trialFailures = 0) =>
        nextKeywordTracking({ tracking: 'trial', trialFailures, merchOnFirstPage });
    it('graduates a trial only with enough Merch on its first page', () => {
        expect(MIN_MERCH_ON_FIRST_PAGE).toBe(3);
        expect(trial(3)).toEqual({ tracking: 'tracked', trialFailures: 0 });
        expect(trial(2)).toEqual({ tracking: 'trial', trialFailures: 1 });
        expect(trial(0)).toEqual({ tracking: 'trial', trialFailures: 1 });
    });
    it('makes a trial dormant after two heads without enough Merch', () => {
        expect(trial(2, 1)).toEqual({ tracking: 'dormant', trialFailures: 2 });
        expect(trial(5, 1)).toEqual({ tracking: 'tracked', trialFailures: 0 });
    });
    it('keeps tracked keywords tracked whatever the first page shows', () => {
        expect(
            nextKeywordTracking({ tracking: 'tracked', trialFailures: 0, merchOnFirstPage: 0 })
        ).toEqual({ tracking: 'tracked', trialFailures: 0 });
    });
});
