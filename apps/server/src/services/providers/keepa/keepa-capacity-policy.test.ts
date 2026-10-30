import { describe, expect, it } from 'bun:test';
import {
    estimateKeepaTokens,
    getKeepaReservation,
    type KeepaCapacityFacts,
} from './keepa-capacity-policy';

const facts: KeepaCapacityFacts = {
    tokensLeft: 1200,
    productCost: 1,
    headCost: 10,
    reservedCost: 0,
    reserveTokens: 100,
    interactiveWaiting: false,
    headRequests: 0,
    discoveryRequests: 0,
    keywordDiscoveryRequests: 0,
};
const history = { operation: 'product' as const, workClass: 'history' as const };

describe('Keepa capacity policy', () => {
    it('lets background spend the bucket down to the live reserve', () => {
        expect(getKeepaReservation(history, { ...facts, tokensLeft: 101 })).toEqual({ cost: 1 });
        expect(getKeepaReservation(history, { ...facts, tokensLeft: 100 })).toEqual({
            reason: 'live-reserve',
        });
        expect(
            getKeepaReservation(history, { ...facts, tokensLeft: 150, reservedCost: 50 })
        ).toEqual({ reason: 'live-reserve' });
    });
    it('reserves a product batch at the per-product cost for each product', () => {
        const batch = { ...history, itemCount: 100 };
        expect(getKeepaReservation(batch, { ...facts, tokensLeft: 200 })).toEqual({ cost: 100 });
        expect(getKeepaReservation(batch, { ...facts, tokensLeft: 199 })).toEqual({
            reason: 'live-reserve',
        });
    });
    it('does not ration background by the hour while the bucket is above the reserve', () => {
        expect(getKeepaReservation({ operation: 'search', workClass: 'head' }, facts)).toEqual({
            cost: 10,
        });
        expect(getKeepaReservation(history, { ...facts, tokensLeft: 600 })).toEqual({ cost: 1 });
    });
    it('requires measured background cost and keeps the head and discovery caps', () => {
        expect(
            getKeepaReservation(
                { operation: 'search', workClass: 'discovery' },
                { ...facts, headCost: null }
            )
        ).toEqual({ reason: 'unmeasured-cost' });
        expect(
            getKeepaReservation(
                { operation: 'search', workClass: 'discovery' },
                { ...facts, keywordDiscoveryRequests: 10 }
            )
        ).toEqual({ reason: 'discovery-pilot-cap' });
        expect(
            getKeepaReservation(
                { operation: 'search', workClass: 'head' },
                { ...facts, headRequests: 50 }
            )
        ).toEqual({ reason: 'head-pilot-cap' });
    });
    it('clamps estimated refill to the real hourly bucket and respects the first refill', () => {
        const observedAt = new Date('2026-10-23T12:00:00Z');
        const state = { tokensLeft: 1, refillRate: 20, refillInMs: 30_000, observedAt };
        expect(estimateKeepaTokens(state, new Date(observedAt.getTime() + 29_999))).toBe(1);
        expect(estimateKeepaTokens(state, new Date(observedAt.getTime() + 30_000))).toBe(21);
        expect(estimateKeepaTokens(state, new Date(observedAt.getTime() + 86_400_000))).toBe(1200);
    });
});

describe('Keepa live requests', () => {
    it('spend the reserve and anything else the bucket holds', () => {
        const request = { operation: 'search' as const, workClass: 'interactive' as const };
        expect(getKeepaReservation(request, { ...facts, tokensLeft: 10 })).toEqual({ cost: 10 });
        expect(getKeepaReservation(request, { ...facts, tokensLeft: 9 })).toEqual({
            reason: 'bucket',
        });
    });
    it('make every background class yield while one waits', () => {
        for (const workClass of ['history', 'head', 'discovery'] as const) {
            expect(
                getKeepaReservation(
                    { operation: 'search', workClass },
                    { ...facts, interactiveWaiting: true }
                )
            ).toEqual({ reason: 'interactive-waiting' });
        }
    });
});
