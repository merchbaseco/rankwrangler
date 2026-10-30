import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { getCutoutInputFingerprint } from '@/services/product-cutout-thumbnail';
import { getCutoutPublicUrl } from '@/services/product-cutout-thumbnail-media';
import { getShortNameInputFingerprint } from '@/services/product-short-name-request';

/**
 * Reads already-generated short names and cutouts for many Products in one query, without
 * starting generation. A stored row counts only while its fingerprint matches the Product's
 * current title and image, the same rule the generating read path applies.
 */
export const readStoredProductEnrichments = async (
    items: readonly StoredEnrichmentSource[]
): Promise<Map<string, StoredEnrichment>> => {
    const result = new Map<string, StoredEnrichment>();
    if (!items.length) return result;
    const identities = JSON.stringify(items.map(item => ({ m: item.marketplaceId, a: item.asin })));
    const rows = await db.execute<StoredEnrichmentRow>(sql`
        select i.m "marketplaceId",i.a asin,
            sn.state "shortNameState",sn.short_name "shortName",sn.input_fingerprint "shortNameFingerprint",
            ct.state "cutoutState",ct.object_key "cutoutObjectKey",ct.input_fingerprint "cutoutFingerprint"
        from jsonb_to_recordset(${identities}::jsonb) as i(m text,a text)
        left join product_short_names sn on sn.marketplace_id=i.m and sn.asin=i.a
        left join product_cutout_thumbnails ct on ct.marketplace_id=i.m and ct.asin=i.a`);
    const stored = new Map(rows.map(row => [enrichmentKey(row), row]));
    for (const item of items) {
        const row = stored.get(enrichmentKey(item));
        result.set(enrichmentKey(item), {
            shortName: storedShortName(item, row),
            cutoutThumbnailUrl: currentCutoutUrl(item, row),
        });
    }
    return result;
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

interface StoredEnrichmentRow extends Record<string, unknown> {
    marketplaceId: string;
    asin: string;
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
