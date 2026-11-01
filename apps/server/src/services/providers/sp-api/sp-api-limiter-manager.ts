import type Bottleneck from 'bottleneck';
import { SyncPausedError } from '@/services/discovery-types';
import { captureProviderAttempt } from '@/services/providers/provider-telemetry';
import { runWithSpApiBackoff } from './sp-api-backoff';
import type { CatalogLimiter, CatalogPriority } from './sp-api-catalog-limiter';
import {
    createLimiterState,
    extractRateLimitFromError,
    extractRateLimitFromResponse,
    getLimiterSettingsFromRps,
    getRateLimitTunedRps,
    getThrottlePenalizedRps,
    isThrottleError,
    readRetryAfterMs,
    type SpApiLimiterOperationId,
    type SpApiLimiterState,
    shouldApplyLimiterUpdate,
    shouldApplyThrottlePenalty,
} from './sp-api-rate-limiter';

export type SpApiOperationRateLimiterStat = {
    operationId: SpApiLimiterOperationId;
    label: string;
    configuredRps: number;
    effectiveRps: number;
    queued: number;
};

type ReportsOperationId = Exclude<SpApiLimiterOperationId, 'catalog.searchCatalogItems'>;

interface ReportsLimiterConfig {
    burstCapacity: number;
    configuredRps: number;
    label: string;
    limiter: Bottleneck;
    maxConcurrent: number;
    operationId: ReportsOperationId;
}

type ReportsLimiter = ReportsLimiterConfig & { state: SpApiLimiterState };

// Catalog search goes through the one Catalog limiter (priority, background share, pause and 429
// adaptation). Each Reports operation keeps its own Bottleneck reservoir tuned from rate headers.
export class SpApiLimiterManager {
    private readonly reports: Map<ReportsOperationId, ReportsLimiter>;

    constructor(
        private readonly catalog: {
            limiter: CatalogLimiter;
            // Amazon's documented rate, shown on System Status as the operation's ceiling.
            documentedRps: number;
            isBackgroundPaused: () => Promise<boolean>;
        },
        reports: ReportsLimiterConfig[] = [],
        private readonly captureAttempt: typeof captureProviderAttempt = captureProviderAttempt
    ) {
        this.reports = new Map(
            reports.map(config => [
                config.operationId,
                {
                    ...config,
                    state: createLimiterState({
                        configuredRps: config.configuredRps,
                        label: config.label,
                    }),
                },
            ])
        );
    }

    runOperation = async <T>({
        ensureAccessTokenFreshness,
        operation,
        operationId,
        run,
        maxAttempts,
        priority = 'foreground',
    }: {
        ensureAccessTokenFreshness: () => Promise<void>;
        operation: string;
        operationId: SpApiLimiterOperationId;
        run: () => Promise<T>;
        maxAttempts?: number;
        priority?: CatalogPriority;
    }) =>
        await runWithSpApiBackoff({
            operation,
            maxAttempts,
            run: async () =>
                operationId === 'catalog.searchCatalogItems'
                    ? await this.runCatalog({ ensureAccessTokenFreshness, priority, run })
                    : await this.runReports({ ensureAccessTokenFreshness, operationId, run }),
        });

    getOperationRateLimiterStats = (): SpApiOperationRateLimiterStat[] => {
        const catalog = this.catalog.limiter.snapshot();
        return [
            {
                operationId: 'catalog.searchCatalogItems',
                label: 'Catalog Search',
                configuredRps: this.catalog.documentedRps,
                effectiveRps: catalog.effectiveRps,
                queued: catalog.queued,
            },
            ...[...this.reports.values()].map(entry => ({
                operationId: entry.operationId,
                label: entry.label,
                configuredRps: entry.configuredRps,
                effectiveRps: entry.state.effectiveRps,
                queued: entry.limiter.queued(),
            })),
        ];
    };

    private readonly runCatalog = async <T>({
        ensureAccessTokenFreshness,
        priority,
        run,
    }: {
        ensureAccessTokenFreshness: () => Promise<void>;
        priority: CatalogPriority;
        run: () => Promise<T>;
    }) => {
        const { limiter } = this.catalog;
        await limiter.acquire(priority);
        // Checked at the start, after any wait, so a pause stops background requests at once.
        if (priority === 'background' && (await this.catalog.isBackgroundPaused()))
            throw new SyncPausedError();
        await ensureAccessTokenFreshness();
        try {
            const result = await this.capture('catalog.searchCatalogItems', run);
            limiter.observe({ kind: 'ok', observedRate: extractRateLimitFromResponse(result) });
            return result;
        } catch (error) {
            const observedRate = extractRateLimitFromError(error);
            limiter.observe(
                isThrottleError(error)
                    ? { kind: 'throttled', observedRate, retryAfterMs: readRetryAfterMs(error) }
                    : { kind: 'failed', observedRate }
            );
            throw error;
        }
    };

    private readonly runReports = async <T>({
        ensureAccessTokenFreshness,
        operationId,
        run,
    }: {
        ensureAccessTokenFreshness: () => Promise<void>;
        operationId: ReportsOperationId;
        run: () => Promise<T>;
    }) => {
        const entry = this.reports.get(operationId);
        if (!entry) throw new Error(`[SP-API] No limiter configured for ${operationId}`);
        return await entry.limiter.schedule(async () => {
            await ensureAccessTokenFreshness();
            try {
                const result = await this.capture(operationId, run);
                await this.trackOperationSuccess(entry, result);
                return result;
            } catch (error) {
                await this.trackOperationFailure(entry, error);
                throw error;
            }
        });
    };

    private readonly capture = <T>(operationId: SpApiLimiterOperationId, run: () => Promise<T>) =>
        this.captureAttempt(
            { provider: 'spapi', operation: mapTelemetryOperation(operationId) },
            run
        );

    private readonly trackOperationSuccess = async (entry: ReportsLimiter, response: unknown) => {
        entry.state.successes += 1;
        entry.state.lastSuccessAt = new Date().toISOString();

        const observedRateLimit = extractRateLimitFromResponse(response);
        if (observedRateLimit === null) {
            return;
        }

        entry.state.lastObservedRateLimit = observedRateLimit;
        entry.state.lastObservedRateLimitAt = new Date().toISOString();
        entry.state.rateLimitSamples += 1;

        await this.applyLimiterRps(
            entry,
            getRateLimitTunedRps({
                currentRps: entry.state.effectiveRps,
                observedRateLimitRps: observedRateLimit,
            })
        );
    };

    private readonly trackOperationFailure = async (entry: ReportsLimiter, error: unknown) => {
        entry.state.failures += 1;
        entry.state.lastErrorAt = new Date().toISOString();

        const observedRateLimit = extractRateLimitFromError(error);
        if (observedRateLimit !== null) {
            entry.state.lastObservedRateLimit = observedRateLimit;
            entry.state.lastObservedRateLimitAt = new Date().toISOString();
            entry.state.rateLimitSamples += 1;
        }

        if (isThrottleError(error)) {
            entry.state.throttles += 1;
            if (!shouldApplyThrottlePenalty(entry.state.lastAppliedRpsAt)) {
                return;
            }
            await this.applyLimiterRps(entry, getThrottlePenalizedRps(entry.state.effectiveRps));
        }
    };

    private readonly applyLimiterRps = async (entry: ReportsLimiter, nextRps: number) => {
        if (!shouldApplyLimiterUpdate({ nextRps, previousRps: entry.state.effectiveRps })) {
            return;
        }

        await entry.limiter.updateSettings(
            getLimiterSettingsFromRps({
                burstCapacity: entry.burstCapacity,
                maxConcurrent: entry.maxConcurrent,
                rps: nextRps,
            })
        );
        entry.state.effectiveRps = nextRps;
        entry.state.lastAppliedRps = nextRps;
        entry.state.lastAppliedRpsAt = new Date().toISOString();
        entry.state.adaptations += 1;
    };
}

export const mapTelemetryOperation = (operationId: SpApiLimiterOperationId) => {
    switch (operationId) {
        case 'catalog.searchCatalogItems':
            return 'spapi.catalog.search' as const;
        case 'reports.createReport':
            return 'spapi.reports.create' as const;
        case 'reports.getReport':
            return 'spapi.reports.get' as const;
        case 'reports.getReportDocument':
            return 'spapi.reports.getDocument' as const;
        default: {
            const unexpectedOperation: never = operationId;
            return unexpectedOperation;
        }
    }
};
