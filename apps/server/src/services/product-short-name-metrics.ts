import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { SHORT_NAME_GENERATOR_VERSION } from './product-short-name';

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
    abstained: number;
    failed: number;
    geminiCalls: number;
    geminiErrors: number;
    typeSafeCalls: number;
    typeSafeErrors: number;
}

interface ActivityBucketRow extends Record<string, unknown> {
    hour: string;
    generated: number;
    failed: number;
}
interface RecentRow extends Record<string, unknown> {
    asin: string | null;
    marketplaceId: string | null;
    status: string;
    outcome: string | null;
    occurredAt: string;
}

export const getProductShortNameMetrics = async () => {
    const [coverageRows, activityRows, bucketRows, recentRows] = await Promise.all([
        db.execute<CoverageRow>(sql`
            SELECT
                count(*)::int AS eligible,
                count(s.asin) FILTER (WHERE s.state = 'ready'
                    AND s.input_fingerprint = md5(
                        octet_length(p.title)::text || ':' || p.title ||
                        octet_length(p.thumbnail_url)::text || ':' || p.thumbnail_url ||
                        ${SHORT_NAME_GENERATOR_VERSION}
                    ))::int AS ready,
                count(s.asin) FILTER (WHERE s.state = 'ready'
                    AND s.input_fingerprint <> md5(
                        octet_length(p.title)::text || ':' || p.title ||
                        octet_length(p.thumbnail_url)::text || ':' || p.thumbnail_url ||
                        ${SHORT_NAME_GENERATOR_VERSION}
                    ))::int AS "needsRegeneration",
                count(*) FILTER (WHERE s.asin IS NULL)::int AS "neverRequested",
                count(s.asin) FILTER (WHERE s.state = 'pending')::int AS pending,
                count(s.asin) FILTER (WHERE s.state = 'error')::int AS error
            FROM products p
            LEFT JOIN product_short_names s
                ON s.marketplace_id = p.marketplace_id AND s.asin = p.asin
            WHERE p.is_merch_listing = true
                AND p.title IS NOT NULL AND p.thumbnail_url IS NOT NULL
                AND p.amazon_listing_status = 'active'
        `),
        db.execute<ActivityRow>(sql`
            SELECT
                (SELECT count(*)::int FROM event_logs
                    WHERE action = 'product.shortName.generate'
                    AND status = 'success' AND occurred_at >= now() - interval '24 hours')
                    AS generated,
                (SELECT count(*)::int FROM event_logs
                    WHERE action = 'product.shortName.generate'
                    AND details_json ->> 'outcome' = 'abstained'
                    AND occurred_at >= now() - interval '24 hours') AS abstained,
                (SELECT count(*)::int FROM event_logs
                    WHERE action = 'product.shortName.generate'
                    AND status = 'failed' AND occurred_at >= now() - interval '24 hours')
                    AS failed,
                count(*) FILTER (WHERE provider = 'gemini')::int AS "geminiCalls",
                count(*) FILTER (WHERE provider = 'gemini' AND is_error)::int
                    AS "geminiErrors",
                count(*) FILTER (WHERE provider = 'typesafe')::int AS "typeSafeCalls",
                count(*) FILTER (WHERE provider = 'typesafe' AND is_error)::int
                    AS "typeSafeErrors"
            FROM provider_attempts
            WHERE attempted_at >= now() - interval '24 hours'
        `),
        db.execute<ActivityBucketRow>(sql`
            SELECT
                h.hour::text,
                count(e.id) FILTER (WHERE e.status = 'success')::int AS generated,
                count(e.id) FILTER (WHERE e.status = 'failed')::int AS failed
            FROM generate_series(
                date_trunc('hour', now()) - interval '23 hours',
                date_trunc('hour', now()),
                interval '1 hour'
            ) h(hour)
            LEFT JOIN event_logs e
                ON e.action = 'product.shortName.generate'
                AND e.occurred_at >= h.hour AND e.occurred_at < h.hour + interval '1 hour'
            GROUP BY h.hour
            ORDER BY h.hour
        `),
        db.execute<RecentRow>(sql`
            SELECT asin, marketplace_id AS "marketplaceId", status,
                details_json ->> 'outcome' AS outcome, occurred_at::text AS "occurredAt"
            FROM event_logs
            WHERE action = 'product.shortName.generate'
            ORDER BY occurred_at DESC
            LIMIT 20
        `),
    ]);
    const coverage = coverageRows[0] ?? {
        eligible: 0,
        ready: 0,
        needsRegeneration: 0,
        neverRequested: 0,
        pending: 0,
        error: 0,
    };
    const activity = activityRows[0] ?? {
        generated: 0,
        abstained: 0,
        failed: 0,
        geminiCalls: 0,
        geminiErrors: 0,
        typeSafeCalls: 0,
        typeSafeErrors: 0,
    };
    return {
        coverage,
        activity,
        hourly: [...bucketRows],
        recent: [...recentRows],
    };
};
