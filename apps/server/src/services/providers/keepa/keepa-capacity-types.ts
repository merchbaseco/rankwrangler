import type { KeepaUsageSource } from './keepa-provider-types';

export type KeepaWorkClass = 'interactive' | 'history' | 'head' | 'discovery';
export type KeepaCapacityOperation = 'product' | 'search' | 'category' | 'token';
export interface KeepaAttemptRequest {
    operation: KeepaCapacityOperation;
    workClass: KeepaWorkClass;
    keywordId?: string;
    workId?: string;
}
export interface KeepaCapacity {
    enqueue(request: KeepaAttemptRequest): Promise<string>;
    cancel(id: string): Promise<void>;
    reserve(id: string): Promise<void>;
    settle(id: string, usage: KeepaUsageSource | null): Promise<void>;
}
export class KeepaCapacityDeferredError extends Error {
    readonly reason: string;
    readonly retryAt: Date;
    constructor(reason: string, retryAt: Date) {
        super(`Keepa capacity deferred: ${reason}`);
        this.name = 'KeepaCapacityDeferredError';
        this.reason = reason;
        this.retryAt = retryAt;
    }
}
