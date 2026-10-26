import { describe, expect, it } from 'bun:test';
import type { spApiCatalogCapacity } from '@/db/spapi-capacity-schema';
import { catalogCapacityDecision, catalogCapacityObservation } from './catalog-capacity-policy';

const now = new Date('2026-10-25T12:00:00Z');
const state = {
    id: 1,
    discoveryClaims: 0,
    effectiveRps: 1,
    observedRate: null,
    observedAt: null,
    tokens: 2,
    backgroundTokens: 1,
    updatedAt: now,
    cooldownUntil: null,
    backgroundPausedUntil: null,
    lastThrottleAt: null,
    foregroundStarts: 0,
    backgroundStarts: 0,
} satisfies typeof spApiCatalogCapacity.$inferSelect;

describe('durable Catalog capacity policy', () => {
    it('continues beyond twenty discovery requests without a daily ceiling', () => {
        let current: typeof spApiCatalogCapacity.$inferSelect = state;
        for (let request = 0; request < 40; request += 1) {
            const decision = catalogCapacityDecision(current, {
                priority: 'background',
                protectedQueued: false,
                now: new Date(now.getTime() + request * 10_000),
            });
            expect(decision.kind).toBe('granted');
            current = { ...current, ...decision.balance };
        }
    });
    it('reserves remaining capacity for foreground reads between discovery starts', () => {
        const discovery = catalogCapacityDecision(state, {
            priority: 'background',
            protectedQueued: false,
            now,
        });
        if (discovery.kind !== 'granted') throw new Error('Expected first discovery slot');
        const current = { ...state, ...discovery.balance };
        const next = catalogCapacityDecision(current, {
            priority: 'background',
            protectedQueued: false,
            now,
        });
        expect(next.kind).toBe('deferred');
        if (next.kind === 'deferred')
            expect(next.retryAt.toISOString()).toBe('2026-10-25T12:00:10.000Z');
        expect(
            catalogCapacityDecision(current, {
                priority: 'foreground',
                protectedQueued: false,
                now,
            }).kind
        ).toBe('granted');
    });
    it('honors fractional measured rate after a restart', () => {
        const observed = {
            ...state,
            ...catalogCapacityObservation(state, {
                now,
                observedRate: 2,
                throttled: false,
                retryAfterMs: 0,
            }),
            backgroundTokens: 0,
        };
        expect(observed.effectiveRps).toBe(1.6);
        const deferred = catalogCapacityDecision(observed, {
            now,
            priority: 'background',
            protectedQueued: false,
        });
        expect(deferred.kind).toBe('deferred');
        if (deferred.kind === 'deferred')
            expect(deferred.retryAt.getTime() - now.getTime()).toBe(6250);
    });
    it('persists throttle cooldown and honors longer Retry-After', () => {
        const throttled = {
            ...state,
            ...catalogCapacityObservation(state, {
                now,
                observedRate: 2,
                throttled: true,
                retryAfterMs: 120_000,
            }),
        };
        const next = catalogCapacityDecision(throttled, {
            now,
            priority: 'background',
            protectedQueued: false,
        });
        expect(throttled.effectiveRps).toBe(0.5);
        if (next.kind !== 'deferred') throw new Error('Throttle must defer');
        expect(next.reason).toBe('cooldown');
        expect(next.retryAt.getTime() - now.getTime()).toBe(120_000);
    });
    it('yields background work when protected reads are queued without consuming a token', () => {
        const next = catalogCapacityDecision(state, {
            now,
            priority: 'background',
            protectedQueued: true,
        });
        expect(next.kind).toBe('deferred');
        expect(next.balance.tokens).toBe(2);
        expect(next.balance.backgroundTokens).toBe(1);
    });
});
