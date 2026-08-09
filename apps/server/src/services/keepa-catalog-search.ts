import { TRPCError } from '@trpc/server';
import { createKeepaProvider, type KeepaProvider } from '@/services/providers/keepa/keepa-provider';

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
const CATALOG_SEARCH_RESULT_LIMIT = 20;

interface KeepaCatalogSearchDeps {
    provider: Pick<KeepaProvider, 'isConfigured' | 'searchCatalog'>;
}

const defaultDeps: KeepaCatalogSearchDeps = {
    provider: createKeepaProvider(),
};

export const searchKeepaCatalog = async (
    {
        marketplaceId,
        term,
        priority,
    }: {
        marketplaceId: string;
        term: string;
        priority: 'interactive' | 'scheduled';
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
    if (!deps.provider.isConfigured()) {
        throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'KEEPA_API_KEY is not configured',
        });
    }

    const payload = await fetchCatalogPayload(deps.provider, {
        marketplaceId,
        term,
        priority: priority === 'interactive' ? 'interactiveCatalog' : 'scheduledCatalog',
    });
    const internalUsage = {
        tokensConsumed: payload.tokensConsumed ?? null,
        tokensLeft: payload.tokensLeft ?? null,
        refillInMs: payload.refillIn ?? null,
        refillRate: payload.refillRate ?? null,
    };
    return {
        products: (payload.products ?? []).slice(0, CATALOG_SEARCH_RESULT_LIMIT),
        internalUsage,
    };
};

const fetchCatalogPayload = async (
    provider: KeepaCatalogSearchDeps['provider'],
    input: Parameters<KeepaProvider['searchCatalog']>[0]
) => {
    try {
        return await provider.searchCatalog(input);
    } catch (cause) {
        throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: 'Keepa Catalog search failed.',
            cause,
        });
    }
};
