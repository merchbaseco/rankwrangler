import { type SQL, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { getCutoutInputFingerprint } from '@/services/product-cutout-thumbnail';
import { getCutoutPublicUrl } from '@/services/product-cutout-thumbnail-media';
import { getShortNameInputFingerprint } from '@/services/product-short-name-request';

/**
 * A Product's already-generated short name and cutout rows as one jsonb object, for selecting
 * beside the Product itself; `storedEnrichment` decides whether they still count. Reading them
 * never starts generation.
 */
export const storedEnrichmentColumn = (marketplaceId: SQL, asin: SQL) => sql`(
    select to_jsonb(x) from (
        select sn.state "shortNameState",sn.short_name "shortName",
            sn.input_fingerprint "shortNameFingerprint",ct.state "cutoutState",
            ct.object_key "cutoutObjectKey",ct.input_fingerprint "cutoutFingerprint"
        from (select 1) one
        left join product_short_names sn on sn.marketplace_id=${marketplaceId} and sn.asin=${asin}
        left join product_cutout_thumbnails ct on ct.marketplace_id=${marketplaceId}
            and ct.asin=${asin}
    ) x)`;

/**
 * A stored row counts only while its fingerprint matches the Product's current title and image,
 * the same rule the generating read path applies.
 */
export const storedEnrichment = (
    item: StoredEnrichmentSource,
    row: StoredEnrichmentRow | null
): StoredEnrichment => ({
    shortName: storedShortName(item, row ?? undefined),
    cutoutThumbnailUrl: currentCutoutUrl(item, row ?? undefined),
});

/** One Product's stored short name and cutout. */
export const readStoredEnrichment = async (item: StoredEnrichmentSource) => {
    const [row] = await db.execute<{ stored: StoredEnrichmentRow | null }>(
        sql`select ${storedEnrichmentColumn(sql`${item.marketplaceId}`, sql`${item.asin}`)} stored`
    );
    return storedEnrichment(item, row?.stored ?? null);
};

export const enrichmentKey = (identity: { marketplaceId: string; asin: string }) =>
    `${identity.marketplaceId}:${identity.asin}`;

export interface StoredEnrichmentSource {
    marketplaceId: string;
    asin: string;
    title: string | null;
    thumbnailUrl: string | null;
}

export interface StoredEnrichment {
    shortName: string | null;
    cutoutThumbnailUrl: string | null;
}

export interface StoredEnrichmentRow {
    shortNameState: string | null;
    shortName: string | null;
    shortNameFingerprint: string | null;
    cutoutState: string | null;
    cutoutObjectKey: string | null;
    cutoutFingerprint: string | null;
}

/** A stored short name counts only while its fingerprint matches the Product's title and image. */
export const storedShortName = (
    item: Pick<StoredEnrichmentSource, 'title' | 'thumbnailUrl'>,
    row?: Pick<StoredEnrichmentRow, 'shortNameState' | 'shortName' | 'shortNameFingerprint'>
) =>
    row?.shortNameState === 'ready' &&
    row.shortName &&
    item.title &&
    item.thumbnailUrl &&
    row.shortNameFingerprint === getShortNameInputFingerprint(item.title, item.thumbnailUrl)
        ? row.shortName
        : null;

const currentCutoutUrl = (item: StoredEnrichmentSource, row?: StoredEnrichmentRow) =>
    row?.cutoutState === 'ready' &&
    row.cutoutObjectKey &&
    item.thumbnailUrl &&
    row.cutoutFingerprint === getCutoutInputFingerprint(item.thumbnailUrl)
        ? getCutoutPublicUrl(row.cutoutObjectKey)
        : null;
