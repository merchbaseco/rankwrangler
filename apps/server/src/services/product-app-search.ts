import type { StoredProductSearchInput } from '@/api/product-search-input';
import { readBsrSparklines } from '@/db/product/product-bsr-sparklines';
import {
    enrichmentKey,
    readStoredProductEnrichments,
} from '@/db/product/product-stored-enrichment';
import { countStoredProducts } from '@/db/product-search-total';
import { createSwrCache } from '@/utils/swr-cache';
import { searchProducts } from './product-search';

const cachedTotal = createSwrCache<Awaited<ReturnType<typeof countStoredProducts>>>({
    freshMs: 60_000,
    staleMs: 30 * 60_000,
    maxEntries: 500,
});

/**
 * The dashboard's Product search: the shared stored search plus already-generated short names,
 * cutouts, a 30-day BSR sparkline per item, and the result total (exact up to a bound, then a
 * planner estimate; fresh per filter for a minute, then served while a background count
 * replaces it). Enrichment is two bounded batch reads for the page and never starts generation;
 * the public search contract is unchanged.
 */
export const searchAppProducts = async (
    input: StoredProductSearchInput & { recordInterest?: boolean }
) => {
    const { recordInterest = true, ...search } = input;
    const { cursor: _c, limit: _l, sort: _s, page: _p, pageSize: _z, ...filters } = search;
    const [result, total] = await Promise.all([
        searchProducts(search, { recordInterest }),
        cachedTotal(JSON.stringify(filters), () => countStoredProducts(filters)),
    ]);
    const sources = result.items.map(item => ({
        marketplaceId: item.marketplaceId,
        asin: item.asin,
        title: item.title,
        thumbnailUrl: item.thumbnail.status === 'available' ? item.thumbnail.url : null,
    }));
    const [stored, sparklines] = await Promise.all([
        readStoredProductEnrichments(sources),
        readBsrSparklines(sources),
    ]);
    return {
        ...result,
        ...total,
        items: result.items.map(item => {
            const key = enrichmentKey(item);
            return {
                ...item,
                shortName: stored.get(key)?.shortName ?? null,
                cutoutThumbnailUrl: stored.get(key)?.cutoutThumbnailUrl ?? null,
                bsr30d: sparklines.get(key) ?? [],
            };
        }),
    };
};
