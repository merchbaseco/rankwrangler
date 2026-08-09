import type { KeepaProductPayload } from '@/services/keepa-product-normalizer';

export interface KeepaUsage {
    tokensConsumed: number | null;
    tokensLeft: number | null;
    refillInMs: number | null;
    refillRate: number | null;
}

export type KeepaResponse = Record<string, unknown> & {
    products?: KeepaProductPayload[];
    tokensConsumed?: number;
    tokensLeft?: number;
    refillIn?: number;
    refillRate?: number;
    error?: { code?: string; message?: string };
};

export interface KeepaCategoryResponse {
    categories?: Record<string, { catId?: number; name?: string; contextFreeName?: string }>;
    tokensConsumed?: number;
    tokensLeft?: number;
    refillIn?: number;
    refillRate?: number;
    error?: { code?: string; message?: string };
}

export interface KeepaTokenResponse {
    tokensConsumed?: number;
    tokensLeft?: number;
    refillIn?: number;
    refillRate?: number;
    error?: { code?: string; type?: string; message?: string };
}

export type KeepaRuntimeTokenState = KeepaUsage & { updatedAt: string | null };
export type KeepaProviderPriority =
    | 'interactiveCatalog'
    | 'scheduledCatalog'
    | 'manualProduct'
    | 'scheduledProduct';

export interface KeepaUsageSource {
    tokensConsumed?: number;
    tokensLeft?: number;
    refillIn?: number;
    refillRate?: number;
}

export class KeepaApiError extends Error implements KeepaUsageSource {
    readonly code: string;
    readonly payload: unknown;
    readonly status: number;
    readonly tokensConsumed?: number;
    readonly tokensLeft?: number;
    readonly refillIn?: number;
    readonly refillRate?: number;

    constructor({
        code,
        message,
        payload,
        status,
    }: {
        code: string;
        message: string;
        payload: unknown;
        status: number;
    }) {
        super(message);
        this.name = 'KeepaApiError';
        this.code = code;
        this.payload = payload;
        this.status = status;
        const usage = isRecord(payload) ? payload : {};
        this.tokensConsumed = asNumber(usage.tokensConsumed);
        this.tokensLeft = asNumber(usage.tokensLeft);
        this.refillIn = asNumber(usage.refillIn);
        this.refillRate = asNumber(usage.refillRate);
    }
}

const asNumber = (value: unknown) => (typeof value === 'number' ? value : undefined);

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};
