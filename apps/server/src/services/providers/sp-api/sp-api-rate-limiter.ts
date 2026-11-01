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
    const target = observedRateLimitRps * RATE_LIMIT_SAFETY_MARGIN;
    const smoothed = EWMA_ALPHA * target + (1 - EWMA_ALPHA) * currentRps;
    return Math.max(Math.min(target, smoothed), MIN_RPS);
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

// Retry-After as milliseconds, from seconds or an HTTP date; 0 when absent.
export const readRetryAfterMs = (error: unknown, now = Date.now()) => {
    if (!isRecord(error)) return 0;
    const response = isRecord(error.response) ? error.response : error;
    const value = getHeaderValue(getHeadersContainer(response), 'retry-after');
    if (!value) return 0;
    const seconds = Number(value);
    return Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000)
        : Math.max(0, Date.parse(value) - now) || 0;
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
