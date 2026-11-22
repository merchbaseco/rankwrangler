import { describe, expect, it } from 'bun:test';
import type { ProductStats } from '@/db/product-stats';
import {
    getKeepaRefreshPolicyBuckets,
    getSpApiRefreshPolicyBuckets,
} from './admin-refresh-policy-buckets';

const stats: ProductStats = {
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
};

describe('refresh policy buckets', () => {
    it('aligns No BSR and Non-Merch rows across Keepa and SP-API', () => {
        const keepa = getKeepaRefreshPolicyBuckets(stats);
        const spApi = getSpApiRefreshPolicyBuckets(stats);

        const keepaNoBsr = keepa.find(bucket => bucket.key === 'merchMissingBsr');
        const spApiNoBsr = spApi.find(bucket => bucket.key === 'merchMissingBsr');
        const keepaNonMerch = keepa.find(bucket => bucket.key === 'nonMerch');
        const spApiNonMerch = spApi.find(bucket => bucket.key === 'nonMerch');

        expect(keepaNoBsr?.label).toBe('No BSR');
        expect(spApiNoBsr?.label).toBe('No BSR');
        expect(spApiNoBsr?.count).toBe(keepaNoBsr?.count);
        expect(spApiNoBsr?.refreshEveryLabel).toBe('Bounded');

        expect(keepaNonMerch?.label).toBe('Non-Merch');
        expect(spApiNonMerch?.label).toBe('Non-Merch');
        expect(spApiNonMerch?.count).toBe(keepaNonMerch?.count);
        expect(spApiNonMerch?.refreshEveryLabel).toBe('Never');
    });
});
