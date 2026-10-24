import { describe, expect, it } from 'bun:test';
import {
    estimateKeepaTokens,
    getKeepaReservation,
    type KeepaCapacityFacts,
} from './keepa-capacity-policy';

const facts: KeepaCapacityFacts = {
    tokensLeft: 1200,
    refillRate: 20,
    productCost: 1,
    headCost: 10,
    reservedCost: 0,
    spent: { interactive: 0, history: 0, head: 0, discovery: 0 },
    historyDue: true,
    headDue: true,
    interactiveWaiting: true,
    headRequests: 0,
    discoveryRequests: 0,
    keywordDiscoveryRequests: 0,
};
describe('Keepa capacity policy', () => {
    it('protects the measured floor after all unresolved reservations', () => {
        expect(
            getKeepaReservation(
                { operation: 'search', workClass: 'head' },
                { ...facts, tokensLeft: 40, reservedCost: 11 }
            )
        ).toEqual({ reason: 'interactive-floor' });
        expect(
            getKeepaReservation(
                { operation: 'search', workClass: 'head' },
                { ...facts, tokensLeft: 40, reservedCost: 10 }
            )
        ).toEqual({ cost: 10 });
    });
    it('requires measured background cost and limits discovery per keyword', () => {
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
    it('limits each rolling class even when the physical bucket is full', () => {
        expect(
            getKeepaReservation(
                { operation: 'search', workClass: 'discovery' },
                { ...facts, spent: { ...facts.spent, discovery: 120 } }
            )
        ).toEqual({ reason: 'rolling-share' });
        expect(
            getKeepaReservation(
                { operation: 'product', workClass: 'history' },
                { ...facts, spent: { ...facts.spent, history: 600 } }
            )
        ).toEqual({ reason: 'rolling-share' });
    });
    it('clamps estimated refill to the real hourly bucket and respects the first refill', () => {
        const observedAt = new Date('2026-10-23T12:00:00Z');
        const state = { tokensLeft: 1, refillRate: 20, refillInMs: 30_000, observedAt };
        expect(estimateKeepaTokens(state, new Date(observedAt.getTime() + 29_999))).toBe(1);
        expect(estimateKeepaTokens(state, new Date(observedAt.getTime() + 30_000))).toBe(21);
        expect(estimateKeepaTokens(state, new Date(observedAt.getTime() + 86_400_000))).toBe(1200);
    });
});

describe('Keepa protected share lending', () => {
    it('lends unused head capacity only when no head work is due', () => {
        const spent = { ...facts.spent, history: 600 };
        expect(
            getKeepaReservation(
                { operation: 'product', workClass: 'history' },
                { ...facts, spent, headDue: false }
            )
        ).toEqual({ cost: 1 });
        expect(
            getKeepaReservation({ operation: 'product', workClass: 'history' }, { ...facts, spent })
        ).toEqual({ reason: 'rolling-share' });
    });
    it('borrows interactive capacity only with no waiting interest and double the floor left', () => {
        const spent = { ...facts.spent, history: 600 };
        const request = { operation: 'product' as const, workClass: 'history' as const };
        expect(
            getKeepaReservation(request, {
                ...facts,
                spent,
                interactiveWaiting: false,
                tokensLeft: 41,
            })
        ).toEqual({ cost: 1 });
        expect(
            getKeepaReservation(request, {
                ...facts,
                spent,
                interactiveWaiting: false,
                tokensLeft: 40,
            })
        ).toEqual({ reason: 'rolling-share' });
        expect(getKeepaReservation(request, { ...facts, spent, interactiveWaiting: true })).toEqual(
            { reason: 'rolling-share' }
        );
    });
    it('never lends capacity to discovery even when no other work is due', () => {
        expect(
            getKeepaReservation(
                { operation: 'search', workClass: 'discovery' },
                {
                    ...facts,
                    historyDue: false,
                    headDue: false,
                    interactiveWaiting: false,
                    spent: { ...facts.spent, discovery: 120 },
                }
            )
        ).toEqual({ reason: 'rolling-share' });
    });
});
