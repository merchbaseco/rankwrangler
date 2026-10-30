import { sql } from 'drizzle-orm';
import type { StoredProductSearchInput } from '@/api/product-search-input';
import { runBackground } from '@/db/index';
import {
    bsrSparklinePointsColumn,
    sampleBsrSparkline,
} from '@/db/product/product-bsr-sparklines';
import {
    type StoredEnrichmentRow,
    storedEnrichment,
    storedEnrichmentColumn,
} from '@/db/product/product-stored-enrichment';
import type { ProductExtraColumn } from '@/db/product-search';
import { countStoredProducts } from '@/db/product-search-total';
import { measure } from '@/utils/request-timing';
import { createSwrCache } from '@/utils/swr-cache';
import { searchProducts } from './product-search';

const cachedTotal = createSwrCache<Awaited<ReturnType<typeof countStoredProducts>>>({
    freshMs: 60_000,
    staleMs: 30 * 60_000,
    maxEntries: 500,
    runRefresh: runBackground,
});

/**
 * The dashboard's Product search: the shared stored search plus already-generated short names,
 * cutouts and a 30-day BSR sparkline per item, read in the same statement as the page, and the
 * result total (exact up to a bound, then a planner estimate; fresh per filter for a minute, then
 * served while a background count replaces it). Enrichment never starts generation; the public
 * search contract is unchanged.
 */
export const searchAppProducts = async (
    input: StoredProductSearchInput & { recordInterest?: boolean }
) => {
    const { recordInterest = true, ...search } = input;
    const { cursor: _c, limit: _l, sort: _s, page: _p, pageSize: _z, ...filters } = search;
    const now = new Date();
    const extra: ProductExtraColumn<AppColumns> = product => sql`jsonb_build_object(
        'stored', ${storedEnrichmentColumn(product.marketplaceId, product.asin)},
        'bsr', ${bsrSparklinePointsColumn(product.id, now)})`;
    const [result, total] = await Promise.all([
        measure('search', () => searchProducts(search, { recordInterest, extra })),
        measure('total', () =>
            cachedTotal(JSON.stringify(filters), () => countStoredProducts(filters))
        ),
    ]);
    return {
        ...result,
        ...total,
        items: result.items.map(({ extra: columns, ...item }) => {
            const source = {
                marketplaceId: item.marketplaceId,
                asin: item.asin,
                title: item.title,
                thumbnailUrl: item.thumbnail.status === 'available' ? item.thumbnail.url : null,
            };
            const stored = storedEnrichment(source, columns?.stored ?? null);
            return {
                ...item,
                shortName: stored.shortName,
                cutoutThumbnailUrl: stored.cutoutThumbnailUrl,
                bsr30d: sampleBsrSparkline(columns?.bsr ?? [], now),
            };
        }),
    };
};

interface AppColumns {
    stored: StoredEnrichmentRow | null;
    bsr: [number, number][];
}
