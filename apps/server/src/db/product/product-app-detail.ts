import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaHistoryMetricColumns } from '@/services/keepa-history-metrics';
import { keepaMinuteToDate } from '@/services/keepa-history-series';
import type { ProductInfo } from '@/types';
import { productBrandKey } from '../product-brand-key';
import { readLowestSeriesPoint } from './product-history-series';
import { readStoredEnrichment } from './product-stored-enrichment';

/**
 * Dashboard-only Product detail beyond the shared retrieval: stored short name and cutout (no
 * generation), how many catalog Products share the normalized brand in this marketplace, and the
 * best main-category BSR Keepa history has recorded.
 */
export const getProductAppDetail = async (
    product: ProductInfo | null
): Promise<ProductAppDetail> => {
    if (!product) return emptyDetail;
    const source = {
        marketplaceId: product.marketplaceId,
        asin: product.asin,
        title: product.title,
        thumbnailUrl: product.thumbnail.status === 'available' ? product.thumbnail.url : null,
    };
    const [stored, brandDesignCount, bestEverBsr] = await Promise.all([
        readStoredEnrichment(source),
        countBrandDesigns(product),
        readBestEverBsr(product),
    ]);
    return {
        shortName: stored.shortName,
        cutoutThumbnailUrl: stored.cutoutThumbnailUrl,
        brandDesignCount,
        bestEverBsr,
    };
};

export interface ProductAppDetail {
    shortName: string | null;
    cutoutThumbnailUrl: string | null;
    /**
     * Null when the Product has no brand; otherwise includes the Product itself, counted up to
     * BRAND_DESIGN_COUNT_LIMIT (`isCapped` when the brand has more).
     */
    brandDesignCount: { count: number; isCapped: boolean } | null;
    bestEverBsr: { value: number; at: string } | null;
}

/** Brand design counts stop here; the page shows "1,000+". */
export const BRAND_DESIGN_COUNT_LIMIT = 1_000;

const emptyDetail: ProductAppDetail = {
    shortName: null,
    cutoutThumbnailUrl: null,
    brandDesignCount: null,
    bestEverBsr: null,
};

/**
 * Products sharing the brand key, counted through `products_marketplace_brand_key_idx` and
 * stopping after BRAND_DESIGN_COUNT_LIMIT + 1: the largest brands (Disney, about 30,000) would
 * otherwise fetch tens of thousands of heap rows per Product page.
 */
const countBrandDesigns = async (product: ProductInfo) => {
    if (!product.brand?.trim()) return null;
    const [row] = await db.execute<{ total: number }>(sql`
        select count(*)::int total from (
            select 1 from products
            where marketplace_id=${product.marketplaceId}
                and ${productBrandKey(sql`brand`)}=${productBrandKey(sql`${product.brand}`)}
            limit ${BRAND_DESIGN_COUNT_LIMIT + 1}
        ) bounded`);
    const total = row?.total ?? 0;
    return {
        count: Math.min(total, BRAND_DESIGN_COUNT_LIMIT),
        isCapped: total > BRAND_DESIGN_COUNT_LIMIT,
    };
};

/** The best main BSR Keepa history has recorded, from its series' stored lowest point. */
const readBestEverBsr = async (product: ProductInfo) => {
    const best = await readLowestSeriesPoint(product, keepaHistoryMetricColumns.bsrMain);
    return best ? { value: best[0], at: keepaMinuteToDate(best[1]).toISOString() } : null;
};
