import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { CUTOUT_GENERATOR_VERSION } from './product-cutout-thumbnail';

interface CoverageRow extends Record<string, unknown> {
    eligible: number;
    ready: number;
    needsRegeneration: number;
    neverRequested: number;
    pending: number;
    error: number;
}

interface ActivityRow extends Record<string, unknown> {
    generated: number;
    failed: number;
    bytesStored: number;
    transformCalls: number;
    transformErrors: number;
    uploadCalls: number;
    uploadErrors: number;
}

interface HourlyRow extends Record<string, unknown> {
    hour: string;
    generated: number;
    failed: number;
}

interface RecentRow extends Record<string, unknown> {
    asin: string | null;
    marketplaceId: string | null;
    status: string;
    occurredAt: string;
}

export const getProductCutoutThumbnailMetrics = async () => {
    const [coverageRows, activityRows, hourlyRows, recentRows] = await Promise.all([
        db.execute<CoverageRow>(sql`
            SELECT
                count(*)::int AS eligible,
                count(c.asin) FILTER (WHERE c.state = 'ready' AND c.object_key IS NOT NULL
                    AND c.input_fingerprint = md5(
                        octet_length(p.thumbnail_url)::text || ':' || p.thumbnail_url ||
                        ${CUTOUT_GENERATOR_VERSION}
                    ))::int AS ready,
                count(c.asin) FILTER (WHERE c.state = 'ready'
                    AND c.input_fingerprint <> md5(
                        octet_length(p.thumbnail_url)::text || ':' || p.thumbnail_url ||
                        ${CUTOUT_GENERATOR_VERSION}
                    ))::int AS "needsRegeneration",
                count(*) FILTER (WHERE c.asin IS NULL)::int AS "neverRequested",
                count(c.asin) FILTER (WHERE c.state = 'pending')::int AS pending,
                count(c.asin) FILTER (WHERE c.state = 'error')::int AS error
            FROM products p
            LEFT JOIN product_cutout_thumbnails c
                ON c.marketplace_id = p.marketplace_id AND c.asin = p.asin
            WHERE p.thumbnail_url IS NOT NULL AND p.amazon_listing_status = 'active'
        `),
        db.execute<ActivityRow>(sql`
            SELECT
                (SELECT count(*)::int FROM event_logs
                    WHERE action = 'product.cutoutThumbnail.generate' AND status = 'success'
                    AND occurred_at >= now() - interval '24 hours') AS generated,
                (SELECT count(*)::int FROM event_logs
                    WHERE action = 'product.cutoutThumbnail.generate' AND status = 'failed'
                    AND occurred_at >= now() - interval '24 hours') AS failed,
                (SELECT coalesce(sum((details_json ->> 'bytes')::bigint), 0)::float8
                    FROM event_logs WHERE action = 'product.cutoutThumbnail.generate'
                    AND status = 'success' AND occurred_at >= now() - interval '24 hours')
                    AS "bytesStored",
                count(*) FILTER (WHERE operation = 'cloudflare.cutout.transform')::int
                    AS "transformCalls",
                count(*) FILTER (WHERE operation = 'cloudflare.cutout.transform' AND is_error)::int
                    AS "transformErrors",
                count(*) FILTER (WHERE operation = 'cloudflare.r2.put')::int AS "uploadCalls",
                count(*) FILTER (WHERE operation = 'cloudflare.r2.put' AND is_error)::int
                    AS "uploadErrors"
            FROM provider_attempts WHERE attempted_at >= now() - interval '24 hours'
        `),
        db.execute<HourlyRow>(sql`
            SELECT h.hour::text,
                count(e.id) FILTER (WHERE e.status = 'success')::int AS generated,
                count(e.id) FILTER (WHERE e.status = 'failed')::int AS failed
            FROM generate_series(
                date_trunc('hour', now()) - interval '23 hours',
                date_trunc('hour', now()), interval '1 hour'
            ) h(hour)
            LEFT JOIN event_logs e ON e.action = 'product.cutoutThumbnail.generate'
                AND e.occurred_at >= h.hour AND e.occurred_at < h.hour + interval '1 hour'
            GROUP BY h.hour ORDER BY h.hour
        `),
        db.execute<RecentRow>(sql`
            SELECT asin, marketplace_id AS "marketplaceId", status,
                occurred_at::text AS "occurredAt"
            FROM event_logs WHERE action = 'product.cutoutThumbnail.generate'
            ORDER BY occurred_at DESC LIMIT 20
        `),
    ]);
    return {
        coverage: coverageRows[0] ?? {
            eligible: 0,
            ready: 0,
            needsRegeneration: 0,
            neverRequested: 0,
            pending: 0,
            error: 0,
        },
        activity: activityRows[0] ?? {
            generated: 0,
            failed: 0,
            bytesStored: 0,
            transformCalls: 0,
            transformErrors: 0,
            uploadCalls: 0,
            uploadErrors: 0,
        },
        hourly: [...hourlyRows],
        recent: [...recentRows],
    };
};
