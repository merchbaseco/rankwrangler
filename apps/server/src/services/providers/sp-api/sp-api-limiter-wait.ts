import type { SpApiLimiterOperationId } from './sp-api-rate-limiter';

// The longest a live (foreground) Catalog call waits for its turn. A healthy limiter starts it
// within seconds; past this, a long throttle cooldown or a wedged limiter holds it, so it fails
// loudly instead of hanging until the caller's own deadline.
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
