import type Bottleneck from 'bottleneck';
import type { SpApiLimiterOperationId } from './sp-api-rate-limiter';

// A healthy limiter starts a queued call within seconds. A call still queued after this deadline
// means the limiter stopped releasing work (a drained reservoir that never refills), so we fail
// loudly instead of letting callers hang until their own handler or caller deadline.
export const SP_API_CATALOG_QUEUE_WAIT_MS = 2 * 60 * 1000;

export class SpApiLimiterWaitError extends Error {
    readonly operationId: SpApiLimiterOperationId;
    readonly label: string;
    readonly maxQueueWaitMs: number;

    constructor({
        operationId,
        label,
        maxQueueWaitMs,
    }: {
        operationId: SpApiLimiterOperationId;
        label: string;
        maxQueueWaitMs: number;
    }) {
        super(
            `[SP-API] ${label} limiter (${operationId}) did not start a queued call within ${maxQueueWaitMs}ms; the limiter may be wedged.`
        );
        this.name = 'SpApiLimiterWaitError';
        this.operationId = operationId;
        this.label = label;
        this.maxQueueWaitMs = maxQueueWaitMs;
    }
}

/**
 * Schedules a call on a Bottleneck limiter, rejecting when it has not started within
 * `maxQueueWaitMs`. Bottleneck cannot cancel a queued job, so an abandoned job skips its work
 * when the limiter eventually releases it.
 */
export const scheduleWithQueueDeadline = <T>({
    limiter,
    maxQueueWaitMs,
    onQueueDeadline,
    task,
}: {
    limiter: Bottleneck;
    maxQueueWaitMs: number | null;
    onQueueDeadline: () => SpApiLimiterWaitError;
    task: () => Promise<T>;
}): Promise<T> => {
    if (maxQueueWaitMs === null) {
        return limiter.schedule(task);
    }

    return new Promise<T>((resolve, reject) => {
        let state: 'queued' | 'started' | 'abandoned' = 'queued';
        const deadline = setTimeout(() => {
            if (state !== 'queued') {
                return;
            }
            state = 'abandoned';
            reject(onQueueDeadline());
        }, maxQueueWaitMs);

        limiter
            .schedule(async () => {
                if (state === 'abandoned') {
                    return null;
                }
                state = 'started';
                clearTimeout(deadline);
                return { value: await task() };
            })
            .then(
                result => {
                    if (result) {
                        resolve(result.value);
                    }
                },
                error => {
                    clearTimeout(deadline);
                    if (state !== 'abandoned') {
                        reject(error);
                    }
                }
            );
    });
};
