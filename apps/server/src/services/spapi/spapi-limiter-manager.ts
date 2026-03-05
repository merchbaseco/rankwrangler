import type Bottleneck from 'bottleneck';
import { runWithSpApiBackoff } from '@/services/spapi/spapi-backoff.js';
import {
    createLimiterState,
    extractRateLimitFromError,
    extractRateLimitFromResponse,
    getLimiterSettingsFromRps,
    getRateLimitTunedRps,
    getThrottlePenalizedRps,
    isThrottleError,
    shouldApplyLimiterUpdate,
    shouldApplyThrottlePenalty,
    toLimiterSnapshot,
    type SpApiLimiterOperationId,
    type SpApiLimiterState,
} from '@/services/spapi/spapi-rate-limiter.js';

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

type OperationLimiterConfig = {
    burstCapacity: number;
    limiter: Bottleneck;
    maxConcurrent: number;
    operationId: SpApiLimiterOperationId;
    state: SpApiLimiterState;
};

type ManagedLimiterConfig = {
    burstCapacity: number;
    configuredRps: number;
    label: string;
    limiter: Bottleneck;
    maxConcurrent: number;
    operationId: SpApiLimiterOperationId;
};

export class SpApiLimiterManager {
    private readonly limiterConfigs: Record<SpApiLimiterOperationId, OperationLimiterConfig>;

    constructor(configs: ManagedLimiterConfig[]) {
        this.limiterConfigs = configs.reduce(
            (acc, config) => {
                acc[config.operationId] = {
                    burstCapacity: config.burstCapacity,
                    limiter: config.limiter,
                    maxConcurrent: config.maxConcurrent,
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
                return await config.limiter.schedule(async () => {
                    await ensureAccessTokenFreshness();
                    try {
                        const result = await run();
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

    private trackOperationSuccess = async ({
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

    private trackOperationFailure = async ({
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

    private applyLimiterRps = async ({
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
