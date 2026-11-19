import { describe, expect, it, mock } from 'bun:test';
import { productSearchInput } from '@/api/product-search-input';
import { CatalogSearchBillingError } from './catalog-search';
import {
    type CollectingProductSearchDeps,
    searchProductsCollectingTerm,
} from './product-search-collection';

const caller = { serviceAccountId: 'account-1', ownerMerchbaseUserId: 'mbu_test' };

describe('MCP Product search collection fallback', () => {
    it('collects an uncollected term once when its first page is empty, then searches again', async () => {
        const deps = createDeps({ pages: [page([]), page(['B000000001'])], collected: false });

        const result = await searchProductsCollectingTerm(
            productSearchInput.parse({ term: 'bruh thanksgiving' }),
            caller,
            deps
        );

        expect(result.items.map(item => item.asin)).toEqual(['B000000001']);
        expect(deps.hasKeywordHeadRun.mock.calls).toEqual([['bruh thanksgiving']]);
        expect(deps.collectKeywordHead.mock.calls).toEqual([
            [{ term: 'bruh thanksgiving', ...caller }],
        ]);
        expect(deps.searchProducts.mock.calls).toHaveLength(2);
    });

    it('answers from the stored catalog when the term was already collected', async () => {
        const deps = createDeps({ pages: [page([])], collected: true });

        const result = await searchProductsCollectingTerm(
            productSearchInput.parse({ term: 'bruh thanksgiving' }),
            caller,
            deps
        );

        expect(result.items).toEqual([]);
        expect(deps.hasKeywordHeadRun.mock.calls).toEqual([['bruh thanksgiving']]);
        expect(deps.collectKeywordHead.mock.calls).toEqual([]);
    });

    it('never collects for a non-empty page, a later page, or a search without a term', async () => {
        const inputs = [
            { term: 'bruh thanksgiving', found: ['B000000001'] },
            { term: 'bruh thanksgiving', cursor: 'next-page', found: [] },
            { found: [] },
            { term: 'bruh thanksgiving', marketplaceId: 'A1F83G8C2ARO7P', found: [] },
        ];
        for (const { found, ...input } of inputs) {
            const deps = createDeps({ pages: [page(found)], collected: false });
            const result = await searchProductsCollectingTerm(
                productSearchInput.parse(input),
                caller,
                deps
            );
            expect(result.items.map(item => item.asin)).toEqual(found);
            expect(deps.collectKeywordHead.mock.calls).toEqual([]);
            expect(deps.searchProducts.mock.calls).toHaveLength(1);
        }
    });

    it('maps an exhausted allowance to TOO_MANY_REQUESTS', async () => {
        const deps = createDeps({ pages: [page([])], collected: false });
        deps.collectKeywordHead.mockImplementation(async () => {
            throw new CatalogSearchBillingError('usageLimitExceeded', null);
        });

        await expect(
            searchProductsCollectingTerm(
                productSearchInput.parse({ term: 'bruh thanksgiving' }),
                caller,
                deps
            )
        ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    });
});

const page = (asins: string[]) =>
    ({
        items: asins.map(asin => ({ asin })),
        nextCursor: null,
        coverage: null,
    }) as unknown as Awaited<ReturnType<CollectingProductSearchDeps['searchProducts']>>;

const createDeps = ({
    pages,
    collected,
}: {
    pages: ReturnType<typeof page>[];
    collected: boolean;
}) => {
    let call = 0;
    return {
        searchProducts: mock(async (_input: unknown) => {
            const next = pages[Math.min(call, pages.length - 1)];
            call += 1;
            return next;
        }),
        hasKeywordHeadRun: mock(async (_term: string) => collected),
        collectKeywordHead: mock(async (_input: unknown) => ({
            runId: 'run-1',
            searchedAt: '2026-11-19T00:00:00.000Z',
            resultCount: 1,
        })),
    } satisfies Record<keyof CollectingProductSearchDeps, unknown>;
};
