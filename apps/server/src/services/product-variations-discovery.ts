import { createSpApiProvider } from '@/services/providers/sp-api/sp-api-provider';
import {
    parseCatalogItems,
    readVariationRole,
    type VariationRole,
} from './product-variations-parse';

export const VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS = 5 * 60 * 1000;
export const VARIATIONS_DISCOVERY_ERROR_CACHE_MAX = 10_000;

export type VariationDeps = {
    searchCatalogItemsByAsins: ReturnType<
        typeof createSpApiProvider
    >['searchCatalogItemsByAsins'];
};

export type VariationDiscoveryDeps = VariationDeps;

export type VariationDiscoveryResult =
    | VariationRole
    | { readonly kind: 'unavailable' };

const discoveryInFlight = new Map<string, Promise<VariationDiscoveryResult>>();
const discoveryErrorUntil = new Map<string, number>();

export const clearVariationDiscoveryCachesForTests = () => {
    discoveryInFlight.clear();
    discoveryErrorUntil.clear();
};

export const discoveryErrorCacheSizeForTests = () => discoveryErrorUntil.size;

/** Foreground Catalog probe. Coalesces concurrent probes and backs off after errors. */
export const discoverVariationRole = async (
    marketplaceId: string,
    asin: string,
    deps: VariationDiscoveryDeps
): Promise<VariationDiscoveryResult> => {
    const key = `${marketplaceId}:${asin.toUpperCase()}`;
    pruneDiscoveryErrorCache(Date.now());
    const errorUntil = discoveryErrorUntil.get(key);
    if (errorUntil !== undefined && Date.now() < errorUntil) {
        return { kind: 'unavailable' };
    }
    if (errorUntil !== undefined) {
        discoveryErrorUntil.delete(key);
    }
    const existing = discoveryInFlight.get(key);
    if (existing) {
        return await existing;
    }
    const work = (async (): Promise<VariationDiscoveryResult> => {
        try {
            const items = parseCatalogItems(
                await deps.searchCatalogItemsByAsins({
                    asins: [asin],
                    marketplaceId,
                    priority: 'foreground',
                })
            );
            const match = items.find(item => catalogAsin(item) === asin.toUpperCase());
            discoveryErrorUntil.delete(key);
            return match ? readVariationRole(match, marketplaceId) : { kind: 'none' };
        } catch (error) {
            rememberDiscoveryError(key, Date.now() + VARIATIONS_DISCOVERY_ERROR_COOLDOWN_MS);
            throw error;
        } finally {
            discoveryInFlight.delete(key);
        }
    })();
    discoveryInFlight.set(key, work);
    return await work;
};

export const rememberDiscoveryErrorForTests = (key: string, untilMs: number) => {
    rememberDiscoveryError(key, untilMs);
};

export const pruneDiscoveryErrorCacheForTests = (nowMs: number = Date.now()) => {
    pruneDiscoveryErrorCache(nowMs);
};

const rememberDiscoveryError = (key: string, untilMs: number) => {
    pruneDiscoveryErrorCache(Date.now());
    if (
        discoveryErrorUntil.size >= VARIATIONS_DISCOVERY_ERROR_CACHE_MAX &&
        !discoveryErrorUntil.has(key)
    ) {
        const oldestKey = discoveryErrorUntil.keys().next().value;
        if (oldestKey !== undefined) {
            discoveryErrorUntil.delete(oldestKey);
        }
    }
    // Re-insert so this key is the newest insertion-order entry for eviction.
    discoveryErrorUntil.delete(key);
    discoveryErrorUntil.set(key, untilMs);
};

const pruneDiscoveryErrorCache = (nowMs: number) => {
    for (const [key, untilMs] of discoveryErrorUntil) {
        if (untilMs <= nowMs) {
            discoveryErrorUntil.delete(key);
        }
    }
};

const catalogAsin = (item: unknown): string | null => {
    if (typeof item !== 'object' || item === null || !('asin' in item)) {
        return null;
    }
    const value = (item as { asin: unknown }).asin;
    return typeof value === 'string' ? value.toUpperCase() : null;
};
