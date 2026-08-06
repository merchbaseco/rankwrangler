import { TRPCError } from '@trpc/server';

export const RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS = 2 * 60 * 1000;
export const RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS = 2;
const RETRY_SHORTLY_SUFFIX = /\s*Retry shortly\.?$/i;

export type RetrievalRetryReason = 'caller_detached' | 'deadline' | 'capacity';

export class RetrievalRetryableError extends Error {
    readonly retryAfterSeconds: number;
    readonly reason: RetrievalRetryReason;

    constructor(
        message: string,
        {
            retryAfterSeconds = RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS,
            reason = 'deadline',
        }: {
            retryAfterSeconds?: number;
            reason?: RetrievalRetryReason;
        } = {}
    ) {
        super(message);
        this.name = 'RetrievalRetryableError';
        this.retryAfterSeconds = retryAfterSeconds;
        this.reason = reason;
    }
}

export const mapRetrievalError = (error: unknown) => {
    if (!(error instanceof RetrievalRetryableError)) {
        return error;
    }

    return new TRPCError({
        code: 'TIMEOUT',
        message: `${error.message.replace(RETRY_SHORTLY_SUFFIX, '')} Retry after ${error.retryAfterSeconds} seconds.`,
        cause: error,
    });
};

const inFlightRetrievals = new Map<string, Promise<unknown>>();

export const coordinateRetrieval = async <T>({
    key,
    work,
    signal,
    timeoutMs = RETRIEVAL_DEFAULT_CALLER_TIMEOUT_MS,
    retryAfterSeconds = RETRIEVAL_DEFAULT_RETRY_AFTER_SECONDS,
    retryMessage = 'The requested data is still being collected. Retry shortly.',
}: {
    key: string;
    work: () => Promise<T>;
    signal?: AbortSignal;
    timeoutMs?: number;
    retryAfterSeconds?: number;
    retryMessage?: string;
}) => {
    const existing = inFlightRetrievals.get(key) as Promise<T> | undefined;
    const sharedWork = existing ?? startSharedWork(key, work);

    return await waitForCaller({
        sharedWork,
        signal,
        timeoutMs,
        retryAfterSeconds,
        retryMessage,
    });
};

const startSharedWork = <T>(key: string, work: () => Promise<T>) => {
    const promise = Promise.resolve().then(work);
    const tracked = promise.finally(() => {
        if (inFlightRetrievals.get(key) === tracked) {
            inFlightRetrievals.delete(key);
        }
    });
    inFlightRetrievals.set(key, tracked);
    return tracked;
};

const waitForCaller = async <T>({
    sharedWork,
    signal,
    timeoutMs,
    retryAfterSeconds,
    retryMessage,
}: {
    sharedWork: Promise<T>;
    signal?: AbortSignal;
    timeoutMs: number;
    retryAfterSeconds: number;
    retryMessage: string;
}) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let removeAbortListener: (() => void) | undefined;

    const callerDeadline = new Promise<never>((_resolve, reject) => {
        if (!Number.isFinite(timeoutMs)) {
            return;
        }

        timeout = setTimeout(
            () => {
                reject(
                    new RetrievalRetryableError(retryMessage, {
                        retryAfterSeconds,
                        reason: 'deadline',
                    })
                );
            },
            Math.max(0, timeoutMs)
        );
    });

    const callerAbort = signal
        ? new Promise<never>((_resolve, reject) => {
              const onAbort = () => {
                  reject(
                      new RetrievalRetryableError(retryMessage, {
                          retryAfterSeconds,
                          reason: 'caller_detached',
                      })
                  );
              };
              if (signal.aborted) {
                  onAbort();
                  return;
              }
              signal.addEventListener('abort', onAbort, { once: true });
              removeAbortListener = () => signal.removeEventListener('abort', onAbort);
          })
        : null;

    try {
        return await Promise.race(
            callerAbort ? [sharedWork, callerDeadline, callerAbort] : [sharedWork, callerDeadline]
        );
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
        removeAbortListener?.();
    }
};
