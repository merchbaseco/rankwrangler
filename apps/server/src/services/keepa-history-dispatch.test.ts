import { describe, expect, test } from 'bun:test';
import { getKeepaHistoryDispatchBatchSize } from '@/services/keepa-history-dispatch';

describe('getKeepaHistoryDispatchBatchSize', () => {
    test('spends the tokens above the live reserve', () => {
        expect(getKeepaHistoryDispatchBatchSize({ tokensLeft: 120, reserveTokens: 100 })).toBe(20);
    });

    test('caps a full bucket at what one run saves within the dispatch hold', () => {
        expect(getKeepaHistoryDispatchBatchSize({ tokensLeft: 1200, reserveTokens: 100 })).toBe(300);
    });

    test('dispatches nothing at or below the reserve', () => {
        expect(getKeepaHistoryDispatchBatchSize({ tokensLeft: 100, reserveTokens: 100 })).toBe(0);
        expect(getKeepaHistoryDispatchBatchSize({ tokensLeft: -30, reserveTokens: 100 })).toBe(0);
    });
});
