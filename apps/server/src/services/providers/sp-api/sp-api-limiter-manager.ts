import type Bottleneck from 'bottleneck';
import { captureProviderAttempt } from '@/services/providers/provider-telemetry';
import { runWithSpApiBackoff } from './sp-api-backoff';
import { SpApiLimiterWaitError, scheduleWithQueueDeadline } from './sp-api-limiter-wait';
import {
    createLimiterState,
    extractRateLimitFromError,
    extractRateLimitFromResponse,
    getLimiterSettingsFromRps,
    getRateLimitTunedRps,
    getThrottlePenalizedRps,
    isThrottleError,
    type SpApiLimiterOperationId,
    type SpApiLimiterState,
    shouldApplyLimiterUpdate,
    shouldApplyThrottlePenalty,
    toLimiterSnapshot,
} from './sp-api-rate-limiter';

export type SpApiOperationRateLimiterStat = {
    operationId: SpApiLimiterOperationId;
} & SpApiLimiterState & {
        queued: number;
        received: number;
        running: number;
        executing: number;
        done: number;
        currentReservoir: number | null;
    };

interface OperationLimiterConfig {
    burstCapacity: number;
    limiter: Bottleneck;
    maxConcurrent: number;
    maxQueueWaitMs: number | null;
    operationId: SpApiLimiterOperationId;
    state: SpApiLimiterState;
}

interface ManagedLimiterConfig {
    burstCapacity: number;
    configuredRps: number;
    label: string;
    limiter: Bottleneck;
    maxConcurrent: number;
    /** Longest a call may sit queued before failing as a wedged limiter; null waits forever. */
    maxQueueWaitMs: number | null;
    operationId: SpApiLimiterOperationId;
}

export class SpApiLimiterManager {
    private readonly limiterConfigs: Record<SpApiLimiterOperationId, OperationLimiterConfig>;

    constructor(configs: ManagedLimiterConfig[]) {
        this.limiterConfigs = configs.reduce(
            (acc, config) => {
                acc[config.operationId] = {
                    burstCapacity: config.burstCapacity,
                    limiter: config.limiter,
                    maxConcurrent: config.maxConcurrent,
                    maxQueueWaitMs: config.maxQueueWaitMs,
                    operationId: config.operationId,
                    state: createLimiterState({
                        configuredRps: config.configuredRps,
                        label: config.label,
                    }),
                };
                return acc;
            },
            {} as Record<SpApiLimiterOperationId, OperationLimiterConfig>
        );
    }

    runOperation = async <T>({
        ensureAccessTokenFreshness,
        operation,
        operationId,
        run,
    }: {
        ensureAccessTokenFreshness: () => Promise<void>;
        operation: string;
        operationId: SpApiLimiterOperationId;
        run: () => Promise<T>;
    }) => {
        const config = this.limiterConfigs[operationId];

        return await runWithSpApiBackoff({
            operation,
            run: async () => {
                return await scheduleWithQueueDeadline({
                    limiter: config.limiter,
                    maxQueueWaitMs: config.maxQueueWaitMs,
                    onQueueDeadline: () => this.reportQueueDeadline(config),
                    task: async () => {
                        await ensureAccessTokenFreshness();
                        try {
                            const result = await captureProviderAttempt(
                                {
                                    provider: 'spapi',
                                    operation: mapTelemetryOperation(operationId),
                                },
                                run
                            );
                            await this.trackOperationSuccess({
                                operationId,
                                response: result,
                            });
                            return result;
                        } catch (error) {
                            await this.trackOperationFailure({
                                error,
                                operationId,
                            });
                            throw error;
                        }
                    },
                });
            },
        });
    };

    getOperationRateLimiterStats = async (): Promise<SpApiOperationRateLimiterStat[]> => {
        return await Promise.all(
            Object.values(this.limiterConfigs).map(async config => {
                return await toLimiterSnapshot({
                    operationId: config.operationId,
                    limiter: config.limiter,
                    state: config.state,
                });
            })
        );
    };

    private readonly reportQueueDeadline = (config: OperationLimiterConfig) => {
        const error = new SpApiLimiterWaitError({
            operationId: config.operationId,
            label: config.state.label,
            maxQueueWaitMs: config.maxQueueWaitMs ?? 0,
        });
        const counts = config.limiter.counts();
        console.error(error.message, {
            operationId: config.operationId,
            queued: counts.QUEUED ?? 0,
            running: counts.RUNNING ?? 0,
            executing: counts.EXECUTING ?? 0,
            effectiveRps: config.state.effectiveRps,
            lastSuccessAt: config.state.lastSuccessAt,
        });
        return error;
    };

    private readonly trackOperationSuccess = async ({
        operationId,
        response,
    }: {
        operationId: SpApiLimiterOperationId;
        response: unknown;
    }) => {
        const config = this.limiterConfigs[operationId];
        config.state.successes += 1;
        config.state.lastSuccessAt = new Date().toISOString();

        const observedRateLimit = extractRateLimitFromResponse(response);
        if (observedRateLimit === null) {
            return;
        }

        config.state.lastObservedRateLimit = observedRateLimit;
        config.state.lastObservedRateLimitAt = new Date().toISOString();
        config.state.rateLimitSamples += 1;

        const tunedRps = getRateLimitTunedRps({
            currentRps: config.state.effectiveRps,
            observedRateLimitRps: observedRateLimit,
        });
        await this.applyLimiterRps({
            config,
            nextRps: tunedRps,
        });
    };

    private readonly trackOperationFailure = async ({
        error,
        operationId,
    }: {
        error: unknown;
        operationId: SpApiLimiterOperationId;
    }) => {
        const config = this.limiterConfigs[operationId];
        config.state.failures += 1;
        config.state.lastErrorAt = new Date().toISOString();

        const observedRateLimit = extractRateLimitFromError(error);
        if (observedRateLimit !== null) {
            config.state.lastObservedRateLimit = observedRateLimit;
            config.state.lastObservedRateLimitAt = new Date().toISOString();
            config.state.rateLimitSamples += 1;
        }

        if (isThrottleError(error)) {
            config.state.throttles += 1;
            if (!shouldApplyThrottlePenalty(config.state.lastAppliedRpsAt)) {
                return;
            }
            await this.applyLimiterRps({
                config,
                nextRps: getThrottlePenalizedRps(config.state.effectiveRps),
            });
        }
    };

    private readonly applyLimiterRps = async ({
        config,
        nextRps,
    }: {
        config: OperationLimiterConfig;
        nextRps: number;
    }) => {
        if (
            !shouldApplyLimiterUpdate({
                nextRps,
                previousRps: config.state.effectiveRps,
            })
        ) {
            return;
        }

        await config.limiter.updateSettings(
            getLimiterSettingsFromRps({
                burstCapacity: config.burstCapacity,
                maxConcurrent: config.maxConcurrent,
                rps: nextRps,
            })
        );
        config.state.effectiveRps = nextRps;
        config.state.lastAppliedRps = nextRps;
        config.state.lastAppliedRpsAt = new Date().toISOString();
        config.state.adaptations += 1;
    };
}

const mapTelemetryOperation = (operationId: SpApiLimiterOperationId) => {
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
