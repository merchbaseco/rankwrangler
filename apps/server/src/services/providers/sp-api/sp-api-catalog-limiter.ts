import { SP_API_CATALOG_QUEUE_WAIT_MS, SpApiLimiterWaitError } from './sp-api-limiter-wait';

// The fastest the server starts Catalog searches, all callers together. Amazon documents 2 a second;
// production settled at 0.5, so raise this in steps as production holds up. A lower
// `x-amzn-RateLimit-Limit` (less a 20% margin) lowers it at runtime.
export const CATALOG_MAX_RPS = 0.5;
// Background work (keyword scans, variation backfill, Merch reclassification) may start at most this
// share of the current rate. Foreground reads always go first and keep the rest.
export const CATALOG_BACKGROUND_SHARE = 0.75;

export type CatalogPriority = 'foreground' | 'background';
export type CatalogOutcome =
    | { kind: 'ok'; observedRate: number | null }
    | { kind: 'throttled'; observedRate: number | null; retryAfterMs: number }
    | { kind: 'failed'; observedRate: number | null };

/**
 * The one Catalog search rate limit, held in process because one server process makes every call.
 * Callers wait their turn: foreground ahead of background, background capped at its share. A 429
 * halves the rate and pauses every start for at least a minute (or Retry-After); each success then
 * raises the rate 10% until it is back at the ceiling.
 */
export class CatalogLimiter {
    private readonly maxRps: number;
    private readonly backgroundShare: number;
    private readonly foregroundWaitMs: number;
    private ceilingRps: number;
    private rps: number;
    private tokens = burst;
    private backgroundTokens = 1;
    private refilledAt = Date.now();
    private cooldownUntil = 0;
    private throttles = 0;
    private readonly queues: Record<CatalogPriority, Waiter[]> = { foreground: [], background: [] };
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        options: { maxRps?: number; backgroundShare?: number; foregroundWaitMs?: number } = {}
    ) {
        this.maxRps = options.maxRps ?? CATALOG_MAX_RPS;
        this.backgroundShare = options.backgroundShare ?? CATALOG_BACKGROUND_SHARE;
        this.foregroundWaitMs = options.foregroundWaitMs ?? SP_API_CATALOG_QUEUE_WAIT_MS;
        this.ceilingRps = this.maxRps;
        this.rps = this.maxRps;
    }

    // Resolves when the caller may send one request. Foreground gives up after its wait deadline;
    // background waits as long as it takes.
    acquire = (priority: CatalogPriority) =>
        new Promise<void>((resolve, reject) => {
            const waiter: Waiter = { resolve, deadline: null };
            if (priority === 'foreground')
                waiter.deadline = setTimeout(() => {
                    this.queues.foreground = this.queues.foreground.filter(item => item !== waiter);
                    reject(
                        new SpApiLimiterWaitError({
                            operationId: 'catalog.searchCatalogItems',
                            label: 'Catalog Search',
                            maxQueueWaitMs: this.foregroundWaitMs,
                        })
                    );
                }, this.foregroundWaitMs);
            this.queues[priority].push(waiter);
            this.pump();
        });

    observe = (outcome: CatalogOutcome) => {
        this.refill();
        const now = Date.now();
        if (outcome.observedRate !== null)
            this.ceilingRps = Math.min(this.maxRps, outcome.observedRate * rateLimitMargin);
        if (outcome.kind === 'throttled') {
            this.throttles += 1;
            // Requests already in flight when the first 429 lands do not halve the rate again.
            if (now >= this.cooldownUntil) this.rps = Math.max(minRps, this.rps / 2);
            this.cooldownUntil = Math.max(
                this.cooldownUntil,
                now + Math.max(minCooldownMs, outcome.retryAfterMs)
            );
        } else if (outcome.kind === 'ok') {
            this.rps = Math.min(this.ceilingRps, this.rps * recoveryStep);
        }
        this.rps = Math.min(this.rps, this.ceilingRps);
        this.pump();
    };

    snapshot = () => ({
        maxRps: this.maxRps,
        effectiveRps: this.rps,
        backgroundRps: this.rps * this.backgroundShare,
        cooldownUntil: this.cooldownUntil > Date.now() ? new Date(this.cooldownUntil) : null,
        queued: this.queues.foreground.length + this.queues.background.length,
        throttles: this.throttles,
    });

    private readonly pump = () => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.refill();
        while (true) {
            const priority: CatalogPriority | null = this.queues.foreground.length
                ? 'foreground'
                : this.queues.background.length
                  ? 'background'
                  : null;
            if (!priority) return;
            const waitMs = this.waitMs(priority);
            if (waitMs > 0) {
                this.timer = setTimeout(this.pump, Math.ceil(waitMs));
                return;
            }
            const waiter = this.queues[priority].shift();
            if (!waiter) return;
            this.tokens -= 1;
            if (priority === 'background') this.backgroundTokens -= 1;
            if (waiter.deadline) clearTimeout(waiter.deadline);
            waiter.resolve();
        }
    };

    private readonly waitMs = (priority: CatalogPriority) =>
        Math.max(
            this.cooldownUntil - Date.now(),
            ((1 - this.tokens) / this.rps) * 1000,
            priority === 'background'
                ? ((1 - this.backgroundTokens) / (this.rps * this.backgroundShare)) * 1000
                : 0
        );

    private readonly refill = () => {
        const now = Date.now();
        const seconds = Math.max(0, now - this.refilledAt) / 1000;
        this.refilledAt = now;
        this.tokens = Math.min(burst, this.tokens + seconds * this.rps);
        this.backgroundTokens = Math.min(
            1,
            this.backgroundTokens + seconds * this.rps * this.backgroundShare
        );
    };
}

type Waiter = { resolve: () => void; deadline: ReturnType<typeof setTimeout> | null };

// Amazon's Catalog burst; background never bursts.
const burst = 2;
const rateLimitMargin = 0.8;
const minRps = 0.05;
const minCooldownMs = 60_000;
const recoveryStep = 1.1;
