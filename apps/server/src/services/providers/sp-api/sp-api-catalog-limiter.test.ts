import { describe, expect, it } from 'bun:test';
import { CatalogLimiter, type CatalogPriority } from './sp-api-catalog-limiter';
import { SpApiLimiterWaitError } from './sp-api-limiter-wait';

describe('Catalog limiter', () => {
    it('starts a foreground read ahead of background work already waiting', async () => {
        const limiter = new CatalogLimiter({ maxRps: 20, backgroundShare: 0.5 });
        await Promise.all([limiter.acquire('foreground'), limiter.acquire('foreground')]);
        const order: string[] = [];
        const take = (priority: CatalogPriority, name: string) =>
            limiter.acquire(priority).then(() => order.push(name));
        await Promise.all([
            take('background', 'scan-1'),
            take('background', 'scan-2'),
            take('foreground', 'live'),
        ]);
        expect(order).toEqual(['live', 'scan-1', 'scan-2']);
    });

    it('never starves a live read behind a long background queue', async () => {
        const limiter = new CatalogLimiter({ maxRps: 20, backgroundShare: 0.75 });
        const scans = Array.from({ length: 10 }, () => limiter.acquire('background'));
        const queuedAt = Date.now();
        await limiter.acquire('foreground');
        // One token interval at 20/s, plus timer slack.
        expect(Date.now() - queuedAt).toBeLessThan(120);
        expect(limiter.snapshot().queued).toBeGreaterThan(5);
        await Promise.all(scans);
    });

    it('holds background to its share of the rate', async () => {
        const limiter = new CatalogLimiter({ maxRps: 40, backgroundShare: 0.25 });
        const starts: number[] = [];
        await Promise.all(
            Array.from({ length: 4 }, () =>
                limiter.acquire('background').then(() => starts.push(Date.now()))
            )
        );
        // 40/s overall but 10/s for background: one start per ~100ms, never a burst.
        const gaps = starts.slice(1).map((at, index) => at - starts[index]);
        expect(gaps.every(gap => gap >= 90)).toBe(true);
    });

    it('halves the rate and pauses every start after a 429, then recovers', async () => {
        const limiter = new CatalogLimiter({ maxRps: 1, foregroundWaitMs: 30 });
        limiter.observe({ kind: 'throttled', observedRate: null, retryAfterMs: 120_000 });
        let snapshot = limiter.snapshot();
        expect(snapshot.effectiveRps).toBe(0.5);
        expect(snapshot.backgroundRps).toBe(0.375);
        expect(snapshot.cooldownUntil!.getTime() - Date.now()).toBeGreaterThan(110_000);
        // A second 429 from a request already in flight does not halve again.
        limiter.observe({ kind: 'throttled', observedRate: null, retryAfterMs: 0 });
        expect(limiter.snapshot().effectiveRps).toBe(0.5);
        await expect(limiter.acquire('foreground')).rejects.toBeInstanceOf(SpApiLimiterWaitError);
        for (let i = 0; i < 10; i += 1) limiter.observe({ kind: 'ok', observedRate: null });
        snapshot = limiter.snapshot();
        expect(snapshot.effectiveRps).toBe(1);
        expect(snapshot.throttles).toBe(2);
    });

    it('lowers its ceiling to 80% of the rate Amazon reports, never above its maximum', () => {
        const limiter = new CatalogLimiter({ maxRps: 0.5 });
        limiter.observe({ kind: 'ok', observedRate: 0.5 });
        expect(limiter.snapshot().effectiveRps).toBe(0.4);
        limiter.observe({ kind: 'ok', observedRate: 2 });
        for (let i = 0; i < 10; i += 1) limiter.observe({ kind: 'ok', observedRate: 2 });
        expect(limiter.snapshot().effectiveRps).toBe(0.5);
        // A plain failure (not a 429) leaves the rate alone.
        limiter.observe({ kind: 'failed', observedRate: null });
        expect(limiter.snapshot().effectiveRps).toBe(0.5);
    });
});
