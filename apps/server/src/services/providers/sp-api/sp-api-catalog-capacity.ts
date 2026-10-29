import { CatalogCapacityDeferredError } from '@/services/discovery-types';
import {
    extractRateLimitFromError,
    extractRateLimitFromResponse,
    isThrottleError,
} from './sp-api-rate-limiter';
import { SP_API_CATALOG_QUEUE_WAIT_MS, SpApiLimiterWaitError } from './sp-api-limiter-wait';

export interface CatalogCapacity {
    reserve(input: {
        priority: 'foreground' | 'background';
        attemptId?: string;
        protectedQueued: boolean;
        now?: Date;
    }): Promise<
        | { kind: 'granted' }
        | {
              kind: 'deferred';
              reason: 'rate' | 'protectedWork' | 'cooldown' | 'paused';
              retryAt: Date;
          }
    >;
    observe(input: {
        attemptId?: string;
        observedRate: number | null;
        throttled: boolean;
        retryAfterMs: number;
        failed: boolean;
        now?: Date;
    }): Promise<void>;
}

export const persistedCatalogCapacity: CatalogCapacity = {
    reserve: async input => (await import('@/db/spapi-capacity')).reserveCatalogCapacity(input),
    observe: async input => (await import('@/db/spapi-capacity')).observeCatalogCapacity(input),
};

export const runWithCatalogCapacity = async <T>(input: {
    capacity: CatalogCapacity;
    priority: 'foreground' | 'background';
    attemptId?: string;
    protectedQueued: boolean;
    run: () => Promise<T>;
}) => {
    const deadline = Date.now() + SP_API_CATALOG_QUEUE_WAIT_MS;
    while (true) {
        const decision = await input.capacity.reserve(input);
        if (decision.kind === 'granted') break;
        if (input.priority === 'background') {
            throw new CatalogCapacityDeferredError(decision.reason, decision.retryAt);
        }
        if (decision.retryAt.getTime() > deadline) {
            throw new SpApiLimiterWaitError({
                operationId: 'catalog.searchCatalogItems',
                label: 'Catalog capacity',
                maxQueueWaitMs: SP_API_CATALOG_QUEUE_WAIT_MS,
            });
        }
        await new Promise(resolve =>
            setTimeout(resolve, Math.max(1, decision.retryAt.getTime() - Date.now()))
        );
    }
    let result: T;
    try {
        result = await input.run();
    } catch (error) {
        await input.capacity.observe({
            attemptId: input.attemptId,
            observedRate: extractRateLimitFromError(error),
            throttled: isThrottleError(error),
            retryAfterMs: readRetryAfterMs(error),
            failed: true,
        });
        throw error;
    }
    await input.capacity.observe({
        attemptId: input.attemptId,
        observedRate: extractRateLimitFromResponse(result),
        throttled: false,
        retryAfterMs: 0,
        failed: false,
    });
    return result;
};

const readRetryAfterMs = (error: unknown, now = Date.now()) => {
    if (!error || typeof error !== 'object') return 0;
    const response = 'response' in error ? error.response : error;
    if (!response || typeof response !== 'object' || !('headers' in response)) return 0;
    const headers = response.headers;
    let value: unknown;
    if (headers instanceof Headers) value = headers.get('retry-after');
    else if (headers && typeof headers === 'object') {
        if ('retry-after' in headers) value = headers['retry-after'];
        else if ('Retry-After' in headers) value = headers['Retry-After'];
    }
    if (typeof value !== 'string' && typeof value !== 'number') return 0;
    const seconds = Number(value);
    return Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000)
        : Math.max(0, Date.parse(String(value)) - now) || 0;
};
