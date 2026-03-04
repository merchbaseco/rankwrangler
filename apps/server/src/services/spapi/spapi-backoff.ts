const SPAPI_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const SPAPI_RETRYABLE_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENOTFOUND',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
]);
const SPAPI_RETRYABLE_MESSAGE_PATTERNS = [
    'too many requests',
    'rate limit exceed error',
    'fetch failed',
    'network',
    'timeout',
] as const;

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

export const runWithSpApiBackoff = async <T>({
    operation,
    run,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
}: {
    operation: string;
    run: () => Promise<T>;
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
}): Promise<T> => {
    let attempt = 0;

    while (attempt < maxAttempts) {
        try {
            return await run();
        } catch (error) {
            const isRetryable = isRetryableSpApiError(error);
            const isLastAttempt = attempt >= maxAttempts - 1;

            if (!isRetryable || isLastAttempt) {
                throw buildFinalSpApiRetryError({
                    operation,
                    attempts: attempt + 1,
                    error,
                    retryable: isRetryable,
                });
            }

            const delayMs = getExponentialBackoffDelayMs({
                attempt,
                initialDelayMs,
                maxDelayMs,
            });
            await sleep(delayMs);
            attempt += 1;
        }
    }

    throw new Error(`[SP-API] ${operation} failed: retry loop exited unexpectedly.`);
};

export const createSpApiHttpError = (message: string, status: number) => {
    const error = new Error(message) as Error & {
        status: number;
    };
    error.status = status;
    return error;
};

export const getExponentialBackoffDelayMs = ({
    attempt,
    initialDelayMs,
    maxDelayMs,
}: {
    attempt: number;
    initialDelayMs: number;
    maxDelayMs: number;
}) => {
    const rawDelayMs = initialDelayMs * 2 ** Math.max(0, attempt);
    return Math.min(maxDelayMs, rawDelayMs);
};

export const isRetryableSpApiError = (error: unknown) => {
    const status = getSpApiErrorStatus(error);
    if (status !== null && SPAPI_RETRYABLE_STATUS_CODES.has(status)) {
        return true;
    }

    const code = getSpApiErrorCode(error);
    if (code !== null && SPAPI_RETRYABLE_CODES.has(code)) {
        return true;
    }

    const message = getSpApiErrorMessage(error);
    if (!message) {
        return false;
    }

    const normalizedMessage = message.toLowerCase();
    return SPAPI_RETRYABLE_MESSAGE_PATTERNS.some(pattern => normalizedMessage.includes(pattern));
};

export class SpApiBackoffError extends Error {
    readonly attempts: number;
    readonly retryable: boolean;

    constructor({
        operation,
        attempts,
        retryable,
        reason,
    }: {
        operation: string;
        attempts: number;
        retryable: boolean;
        reason: string;
    }) {
        super(
            `[SP-API] ${operation} failed after ${attempts} attempt${
                attempts === 1 ? '' : 's'
            }: ${reason}`
        );
        this.name = 'SpApiBackoffError';
        this.attempts = attempts;
        this.retryable = retryable;
    }
}

const getSpApiErrorStatus = (error: unknown): number | null => {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeStatus === 'number') {
        return maybeStatus;
    }

    const maybeResponseStatus = (error as { response?: { status?: unknown } }).response?.status;
    if (typeof maybeResponseStatus === 'number') {
        return maybeResponseStatus;
    }

    const maybeStatusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof maybeStatusCode === 'number') {
        return maybeStatusCode;
    }

    return null;
};

const getSpApiErrorCode = (error: unknown): string | null => {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
        return code;
    }

    const causeCode = (error as { cause?: { code?: unknown } }).cause?.code;
    if (typeof causeCode === 'string') {
        return causeCode;
    }

    return null;
};

const getSpApiErrorMessage = (error: unknown) => {
    if (!(error instanceof Error)) {
        return '';
    }

    return error.message ?? '';
};

const buildFinalSpApiRetryError = ({
    operation,
    attempts,
    error,
    retryable,
}: {
    operation: string;
    attempts: number;
    error: unknown;
    retryable: boolean;
}) => {
    const reason = error instanceof Error ? error.message : 'Unknown SP-API error';
    return new SpApiBackoffError({
        operation,
        attempts,
        retryable,
        reason,
    });
};

const sleep = async (delayMs: number) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
};
