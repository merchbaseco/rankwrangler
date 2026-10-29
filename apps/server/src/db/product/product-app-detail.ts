import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { keepaHistoryMetricColumns } from '@/services/keepa-history-metrics';
import type { ProductInfo } from '@/types';
import { enrichmentKey, readStoredProductEnrichments } from './product-stored-enrichment';

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
        readStoredProductEnrichments([source]),
        countBrandDesigns(product),
        readBestEverBsr(product),
    ]);
    return {
        shortName: stored.get(enrichmentKey(source))?.shortName ?? null,
        cutoutThumbnailUrl: stored.get(enrichmentKey(source))?.cutoutThumbnailUrl ?? null,
        brandDesignCount,
        bestEverBsr,
    };
};

export interface ProductAppDetail {
    shortName: string | null;
    cutoutThumbnailUrl: string | null;
    /** Null when the Product has no brand; otherwise includes the Product itself. */
    brandDesignCount: number | null;
    bestEverBsr: { value: number; at: string } | null;
}

const emptyDetail: ProductAppDetail = {
    shortName: null,
    cutoutThumbnailUrl: null,
    brandDesignCount: null,
    bestEverBsr: null,
};

const countBrandDesigns = async (product: ProductInfo) => {
    if (!product.brand?.trim()) return null;
    const [row] = await db.execute<{ total: number }>(sql`
        select count(*)::int total from products
        where marketplace_id=${product.marketplaceId}
            and lower(btrim(regexp_replace(brand,'[[:space:]]+',' ','g')))
                =lower(btrim(regexp_replace(${product.brand},'[[:space:]]+',' ','g')))`);
    return row?.total ?? 0;
};

const readBestEverBsr = async (product: ProductInfo) => {
    const [row] = await db.execute<{ value: number; at: string }>(sql`
        select value_int value,observed_at at from product_history_points
        where marketplace_id=${product.marketplaceId} and asin=${product.asin}
            and metric=${keepaHistoryMetricColumns.bsrMain} and value_int is not null
        order by value_int asc,observed_at asc limit 1`);
    return row ? { value: row.value, at: utcTimestamp(row.at) } : null;
};

const utcTimestamp = (value: string | Date) =>
    value instanceof Date
        ? value.toISOString()
        : new Date(`${value.replace(' ', 'T')}Z`).toISOString();
