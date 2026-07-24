import { TRPCError } from '@trpc/server';
import { env } from '@/config/env';
import {
    recordKeepaProviderUsage,
    scheduleKeepaProviderRequest,
} from './keepa';
import type { KeepaProductPayload } from './keepa-product-normalizer';

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
const US_KEEPA_DOMAIN_ID = 1;
const CATALOG_SEARCH_RESULT_LIMIT = 20;

type KeepaCatalogSearchPayload = {
    products?: KeepaProductPayload[];
    tokensConsumed?: number;
    tokensLeft?: number;
    refillIn?: number;
    refillRate?: number;
    error?: {
        code?: string;
        message?: string;
    };
};

type KeepaCatalogSearchDeps = {
    apiKey: string | undefined;
    fetchImpl: typeof fetch;
    scheduleRequest: <T>(request: () => Promise<T>) => Promise<T>;
    recordUsage: typeof recordKeepaProviderUsage;
};

const defaultDeps: KeepaCatalogSearchDeps = {
    apiKey: env.KEEPA_API_KEY,
    fetchImpl: fetch,
    scheduleRequest: request => scheduleKeepaProviderRequest('interactive', request),
    recordUsage: recordKeepaProviderUsage,
};

export const searchKeepaCatalog = async (
    {
        marketplaceId,
        term,
    }: {
        marketplaceId: string;
        term: string;
    },
    overrides: Partial<KeepaCatalogSearchDeps> = {}
) => {
    const deps = { ...defaultDeps, ...overrides };
    if (marketplaceId !== US_MARKETPLACE_ID) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Catalog search currently supports only the US marketplace.',
        });
    }
    if (!deps.apiKey) {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'KEEPA_API_KEY is not configured',
        });
    }

    const params = new URLSearchParams({
        key: deps.apiKey,
        domain: String(US_KEEPA_DOMAIN_ID),
        type: 'product',
        term,
        page: '0',
        'asins-only': '0',
        stats: '365',
        update: '1',
        history: '1',
    });
    const response = await deps.scheduleRequest(() =>
        deps.fetchImpl(`https://api.keepa.com/search?${params.toString()}`)
    );
    const payload = (await response.json()) as KeepaCatalogSearchPayload;
    const internalUsage = {
        tokensConsumed: payload.tokensConsumed ?? null,
        tokensLeft: payload.tokensLeft ?? null,
        refillInMs: payload.refillIn ?? null,
        refillRate: payload.refillRate ?? null,
    };
    deps.recordUsage(internalUsage);

    if (!response.ok || payload.error?.message) {
        throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: 'Keepa Catalog search failed.',
        });
    }

    return {
        products: (payload.products ?? []).slice(0, CATALOG_SEARCH_RESULT_LIMIT),
        internalUsage,
    };
};
