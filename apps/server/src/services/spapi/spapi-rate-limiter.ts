import type Bottleneck from 'bottleneck';

const EWMA_ALPHA = 0.2;
const RATE_LIMIT_SAFETY_MARGIN = 0.8;
const MIN_RPS = 0.001;
const RPS_CHANGE_THRESHOLD = 0.01;
const THROTTLE_PENALTY_FACTOR = 0.75;
const THROTTLE_PENALTY_COOLDOWN_MS = 30_000;

export type SpApiLimiterOperationId =
    | 'catalog.searchCatalogItems'
    | 'reports.createReport'
    | 'reports.getReport'
    | 'reports.getReportDocument';

export type SpApiLimiterState = {
    adaptations: number;
    configuredRps: number;
    effectiveRps: number;
    failures: number;
    label: string;
    lastAppliedRps: number;
    lastAppliedRpsAt: string | null;
    lastErrorAt: string | null;
    lastObservedRateLimit: number | null;
    lastObservedRateLimitAt: string | null;
    lastSuccessAt: string | null;
    rateLimitSamples: number;
    successes: number;
    throttles: number;
};

type SpApiLimiterSnapshot = {
    operationId: SpApiLimiterOperationId;
} & SpApiLimiterState & {
        queued: number;
        received: number;
        running: number;
        executing: number;
        done: number;
        currentReservoir: number | null;
    };

export const createLimiterState = ({
    configuredRps,
    label,
}: {
    configuredRps: number;
    label: string;
}): SpApiLimiterState => {
    return {
        adaptations: 0,
        configuredRps,
        effectiveRps: configuredRps,
        failures: 0,
        label,
        lastAppliedRps: configuredRps,
        lastAppliedRpsAt: null,
        lastErrorAt: null,
        lastObservedRateLimit: null,
        lastObservedRateLimitAt: null,
        lastSuccessAt: null,
        rateLimitSamples: 0,
        successes: 0,
        throttles: 0,
    };
};

export const getRateLimitTunedRps = ({
    currentRps,
    observedRateLimitRps,
}: {
    currentRps: number;
    observedRateLimitRps: number;
}) => {
    const smoothed = EWMA_ALPHA * observedRateLimitRps + (1 - EWMA_ALPHA) * currentRps;
    return Math.max(smoothed * RATE_LIMIT_SAFETY_MARGIN, MIN_RPS);
};

export const shouldApplyLimiterUpdate = ({
    nextRps,
    previousRps,
}: {
    nextRps: number;
    previousRps: number;
}) => {
    return Math.abs(nextRps - previousRps) >= RPS_CHANGE_THRESHOLD;
};

export const getThrottlePenalizedRps = (rps: number) => {
    return Math.max(rps * THROTTLE_PENALTY_FACTOR, MIN_RPS);
};

export const shouldApplyThrottlePenalty = (lastAppliedAt: string | null) => {
    if (!lastAppliedAt) {
        return true;
    }

    const elapsedMs = Date.now() - new Date(lastAppliedAt).getTime();
    return elapsedMs >= THROTTLE_PENALTY_COOLDOWN_MS;
};

export const getLimiterSettingsFromRps = ({
    burstCapacity,
    maxConcurrent,
    rps,
}: {
    burstCapacity: number;
    maxConcurrent: number;
    rps: number;
}) => {
    if (rps >= 1) {
        return {
            maxConcurrent,
            reservoir: burstCapacity,
            reservoirIncreaseAmount: Math.max(1, Math.round(rps)),
            reservoirIncreaseInterval: 1_000,
            reservoirIncreaseMaximum: burstCapacity,
        } as const;
    }

    return {
        maxConcurrent,
        reservoir: burstCapacity,
        reservoirIncreaseAmount: 1,
        reservoirIncreaseInterval: Math.max(1_000, Math.ceil(1_000 / Math.max(rps, MIN_RPS))),
        reservoirIncreaseMaximum: burstCapacity,
    } as const;
};

export const extractRateLimitFromResponse = (response: unknown): number | null => {
    return extractRateLimitFromObject(response);
};

export const extractRateLimitFromError = (error: unknown): number | null => {
    return extractRateLimitFromObject(error);
};

export const isThrottleError = (error: unknown) => {
    return getErrorStatus(error) === 429;
};

export const toLimiterSnapshot = async ({
    operationId,
    limiter,
    state,
}: {
    operationId: SpApiLimiterOperationId;
    limiter: Bottleneck;
    state: SpApiLimiterState;
}): Promise<SpApiLimiterSnapshot> => {
    const counts = limiter.counts();
    const currentReservoir = await limiter.currentReservoir();

    return {
        operationId,
        ...state,
        currentReservoir: currentReservoir ?? null,
        done: counts.DONE ?? 0,
        executing: counts.EXECUTING ?? 0,
        queued: counts.QUEUED ?? 0,
        received: counts.RECEIVED ?? 0,
        running: counts.RUNNING ?? 0,
    };
};

const extractRateLimitFromObject = (value: unknown): number | null => {
    const candidates = collectCandidates(value);

    for (const candidate of candidates) {
        const headers = getHeadersContainer(candidate);
        if (!headers) {
            continue;
        }

        const headerValue = getHeaderValue(headers, 'x-amzn-ratelimit-limit');
        if (!headerValue) {
            continue;
        }

        const parsed = Number(headerValue);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return null;
};

const collectCandidates = (value: unknown) => {
    if (!isRecord(value)) {
        return [];
    }

    const candidates: unknown[] = [value];
    const nestedKeys = ['response', '_response', 'rawResponse', 'httpResponse'] as const;

    for (const key of nestedKeys) {
        const nested = value[key];
        if (nested !== undefined) {
            candidates.push(nested);
        }
    }

    return candidates;
};

const getHeadersContainer = (candidate: unknown): unknown => {
    if (!isRecord(candidate)) {
        return null;
    }

    if ('headers' in candidate) {
        return candidate.headers;
    }

    return candidate;
};

const getHeaderValue = (headers: unknown, key: string): string | null => {
    if (headers instanceof Headers) {
        return headers.get(key);
    }

    if (isRecord(headers)) {
        const normalizedKey = key.toLowerCase();
        for (const [headerKey, headerValue] of Object.entries(headers)) {
            if (headerKey.toLowerCase() !== normalizedKey) {
                continue;
            }
            if (typeof headerValue === 'string') {
                return headerValue;
            }
            if (Array.isArray(headerValue) && headerValue.length > 0) {
                const first = headerValue[0];
                if (typeof first === 'string') {
                    return first;
                }
            }
        }
    }

    return null;
};

const getErrorStatus = (error: unknown): number | null => {
    if (!isRecord(error)) {
        return null;
    }

    const statusCandidates = [
        error.status,
        error.statusCode,
        isRecord(error.response) ? error.response.status : null,
    ];
    for (const candidate of statusCandidates) {
        if (typeof candidate === 'number') {
            return candidate;
        }
    }

    return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};
