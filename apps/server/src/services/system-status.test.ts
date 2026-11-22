import { describe, expect, it } from 'bun:test';
import type { ProductStats } from '@/db/product-stats';
import { buildProductIndex, computeKeepaDailyPlanLoad } from './system-status';

const sampleStats = (overrides: Partial<ProductStats> = {}): ProductStats => ({
    id: 1,
    observedAt: new Date('2026-11-21T19:00:00Z'),
    products: 967_303,
    merch: 949_343,
    new24h: 22_219,
    merchWithHistory: 137_488,
    merchAwaitingFirst: 3_804,
    merchNotTracked: 791_858,
    spApiLt200k: 8_510,
    spApi200kTo500k: 25_426,
    spApi500kTo1m: 60_406,
    spApi1mTo3m: 193_585,
    spApiGte3m: 266_639,
    spApiNonAuto: 412_737,
    historyTwiceDaily: 3_308,
    historyDaily: 13_000,
    historyWeekly: 29_368,
    historyBiweekly: 31_784,
    keepaWaitingDaily: 0,
    keepaWaitingWeekly: 0,
    keepaWaitingBiweekly: 15_852,
    keepaOnDemand: 460_224,
    keepaMerchMissingBsr: 397_878,
    keepaNonMerch: 14_859,
    historyOverdue: 0,
    historyOldestOverdueAt: null,
    providerCalls: [],
    ...overrides,
});

describe('buildProductIndex', () => {
    it('partitions active Merch into auto-tracked, on-demand, and no-BSR and zooms history into <1M', () => {
        const index = buildProductIndex(sampleStats());
        expect(index.breakdown).toEqual({
            autoTracked: 93_312,
            onDemand: 458_153,
            noBsr: 397_878,
        });
        expect(
            index.breakdown.autoTracked + index.breakdown.onDemand + index.breakdown.noBsr
        ).toBe(index.merch);
        expect(index.history).toEqual({
            withHistory: 137_488,
            autoSynced: 73_656,
            awaitingFirst: 3_804,
            awaitingAdmission: 15_852,
            notTracked: 791_858,
        });
        expect(
            index.history.autoSynced +
                index.history.awaitingFirst +
                index.history.awaitingAdmission
        ).toBe(index.breakdown.autoTracked);
    });
});

describe('computeKeepaDailyPlanLoad', () => {
    it('returns standing daily spend as a share of total daily refill', () => {
        const load = computeKeepaDailyPlanLoad(sampleStats(), 20, 1);
        expect(load).not.toBeNull();
        expect(load?.dailyTokens).toBe(28_800);
        // 3308 + 13000/2 + 29368/7 + 31784/14 = 3308 + 6500 + 4195.43 + 2270.29 = 16273.71
        expect(load?.projectedDailyTokens).toBe(16_274);
        expect(load?.share).toBeCloseTo(16_273.714 / 28_800, 4);
    });

    it('returns null when refill rate or product cost is unknown', () => {
        expect(computeKeepaDailyPlanLoad(sampleStats(), null, 1)).toBeNull();
        expect(computeKeepaDailyPlanLoad(sampleStats(), 20, null)).toBeNull();
        expect(computeKeepaDailyPlanLoad(sampleStats(), 0, 1)).toBeNull();
    });
});
