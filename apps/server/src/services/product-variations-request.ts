import {
    type StoredVariationRow,
    VARIATIONS_ERROR_RETRY_MS,
    VARIATIONS_GENERATOR_VERSION,
    VARIATIONS_REUSE_MS,
} from '@/db/product/product-variation-store';
import type { VariationFamily } from './product-variations-parse';

export interface ProductVariations {
    parentAsin: string;
    theme: string[];
    defaultChildAsin: string;
    children: Array<{ asin: string; attributes: Record<string, string> }>;
    fetchedAt: string;
}

export interface VariationRequest {
    marketplaceId: string;
    asin: string;
    signal?: AbortSignal;
    timeoutMs: number;
}

export type ClassifiedStoredVariations =
    | { state: 'ready'; value: ProductVariations | null }
    | { state: 'failed'; retryAfterSeconds: number }
    | { state: 'missing'; parentAsin: string | null };

export type ProductVariationsStatus = 'ready' | 'none' | 'pending' | 'failed' | 'not_requested';

export type VariationsOutcome =
    | { status: 'ready'; value: ProductVariations }
    | { status: 'none' }
    | { status: 'pending'; retryAfterSeconds: number }
    | { status: 'failed'; retryAfterSeconds: number };

export type PublicVariationsFields = {
    variations: ProductVariations | null;
    variationsStatus: ProductVariationsStatus;
    variationsRetryAfterSeconds?: number;
};

/** `outcome` is null when the caller never requested `variations`. */
export const toPublicVariationsFields = (
    outcome: VariationsOutcome | null
): PublicVariationsFields => {
    if (outcome === null) {
        return { variations: null, variationsStatus: 'not_requested' };
    }
    if (outcome.status === 'ready') {
        return { variations: outcome.value, variationsStatus: 'ready' };
    }
    if (outcome.status === 'none') {
        return { variations: null, variationsStatus: 'none' };
    }
    return {
        variations: null,
        variationsStatus: outcome.status,
        variationsRetryAfterSeconds: outcome.retryAfterSeconds,
    };
};

export const variationsRetrievalKey = ({
    marketplaceId,
    asin,
}: Pick<VariationRequest, 'marketplaceId' | 'asin'>) =>
    `product-variations:${marketplaceId}:${asin.toUpperCase()}:${VARIATIONS_GENERATOR_VERSION}`;

export const classifyStoredVariations = (
    rows: readonly StoredVariationRow[],
    requestedAsin: string
): ClassifiedStoredVariations => {
    const now = Date.now();
    const current = rows.filter(row => row.generatorVersion === VARIATIONS_GENERATOR_VERSION);
    const readyFamily = current.find(
        row =>
            row.state === 'ready' &&
            row.kind === 'family' &&
            row.fetchedAt !== null &&
            now - row.fetchedAt.getTime() < VARIATIONS_REUSE_MS
    );
    if (readyFamily?.children && readyFamily.fetchedAt) {
        return {
            state: 'ready',
            value: toProductVariations(
                {
                    parentAsin: readyFamily.parentAsin,
                    theme: readyFamily.theme ?? [],
                    children: readyFamily.children,
                },
                readyFamily.fetchedAt
            ),
        };
    }
    const readyNone = current.find(
        row =>
            row.state === 'ready' &&
            row.kind === 'none' &&
            row.fetchedAt !== null &&
            now - row.fetchedAt.getTime() < VARIATIONS_REUSE_MS &&
            row.parentAsin === requestedAsin
    );
    if (readyNone) {
        return { state: 'ready', value: null };
    }
    const pending = current.find(row => row.state === 'pending');
    if (pending) {
        return { state: 'missing', parentAsin: pending.parentAsin };
    }
    const failed = current.find(
        row =>
            row.state === 'error' && now - row.attemptedAt.getTime() < VARIATIONS_ERROR_RETRY_MS
    );
    if (failed) {
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil((failed.attemptedAt.getTime() + VARIATIONS_ERROR_RETRY_MS - now) / 1000)
        );
        return { state: 'failed', retryAfterSeconds };
    }
    const anyParent = current[0]?.parentAsin ?? rows[0]?.parentAsin ?? null;
    return { state: 'missing', parentAsin: anyParent };
};

export const toProductVariations = (
    family: VariationFamily,
    fetchedAt: Date
): ProductVariations => {
    const [first] = family.children;
    if (!first) {
        throw new Error(`Variation family ${family.parentAsin} has no children.`);
    }
    return {
        parentAsin: family.parentAsin,
        theme: [...family.theme],
        defaultChildAsin: first.asin,
        children: family.children.map(child => ({
            asin: child.asin,
            attributes: { ...child.attributes },
        })),
        fetchedAt: fetchedAt.toISOString(),
    };
};
