import { and, asc, eq, sql } from 'drizzle-orm';
import { extractKeywordPrefix } from '@/services/keyword-prefix';
import { catalogQueries } from './catalog-search-schema';
import { discoverySourceScans, discoveryTargets } from './discovery-target-schema';
import { db } from './index';
import { keywordPrefixes } from './keyword-prefix-schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const marketplaceId = 'ATVPDKIKX0DER';
const backfillKey = 'keyword-prefixes';
// Once the backfill reaches the newest tracked keyword it only re-checks daily; graduation and
// user tracking register prefixes as they happen.
const backfillIdleMs = 86_400_000;

// Registers the prefixes of newly tracked US keywords. One row per prefix; known prefixes are
// ignored.
export const registerKeywordPrefixes = async (
    tx: Transaction,
    keywords: readonly { queryId: string; term: string; marketplaceId: string }[],
    now = new Date()
) => {
    const prefixes = new Map<string, string>();
    for (const keyword of keywords) {
        if (keyword.marketplaceId !== marketplaceId) continue;
        const prefix = extractKeywordPrefix(keyword.term);
        if (prefix && !prefixes.has(prefix)) prefixes.set(prefix, keyword.queryId);
    }
    if (!prefixes.size) return 0;
    const inserted = await tx
        .insert(keywordPrefixes)
        .values(
            [...prefixes]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([prefix, firstQueryId]) => ({
                    marketplaceId,
                    prefix,
                    firstQueryId,
                    nextDueAt: now,
                    createdAt: now,
                }))
        )
        .onConflictDoNothing()
        .returning({ id: keywordPrefixes.id });
    return inserted.length;
};

// Registers the prefixes of keywords that were already tracked before prefixes existed, one bounded
// batch per call, by a cursor over tracked keyword targets in creation order.
export const backfillKeywordPrefixes = async (limit: number, now = new Date()) =>
    db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-prefixes-backfill'))`);
        await tx
            .insert(discoverySourceScans)
            .values({ key: backfillKey, nextDueAt: now })
            .onConflictDoNothing();
        const [scan] = await tx
            .select()
            .from(discoverySourceScans)
            .where(eq(discoverySourceScans.key, backfillKey))
            .for('update');
        if (scan.nextDueAt > now) return { scanned: 0, registered: 0 };
        const rows = await tx
            .select({
                targetId: discoveryTargets.id,
                queryId: catalogQueries.id,
                term: catalogQueries.normalizedTerm,
                marketplaceId: catalogQueries.marketplaceId,
            })
            .from(discoveryTargets)
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(
                and(
                    eq(discoveryTargets.kind, 'keyword'),
                    eq(discoveryTargets.tracking, 'tracked'),
                    // The cursor columns are shared with other scans; here they hold a target's
                    // creation time and id. Compared in SQL to keep microsecond precision.
                    scan.cursorProductId
                        ? sql`(${discoveryTargets.createdAt},${discoveryTargets.id})>(select cursor_created_at,cursor_product_id from discovery_source_scans where key=${backfillKey})`
                        : undefined
                )
            )
            .orderBy(asc(discoveryTargets.createdAt), asc(discoveryTargets.id))
            .limit(limit);
        const registered = await registerKeywordPrefixes(tx, rows, now);
        const last = rows.at(-1);
        await tx
            .update(discoverySourceScans)
            .set({
                // Read in SQL: creation times carry microseconds that a JS Date would drop.
                ...(last
                    ? {
                          cursorCreatedAt: sql`(select created_at from discovery_targets where id=${last.targetId})`,
                          cursorProductId: last.targetId,
                      }
                    : {}),
                nextDueAt: rows.length < limit ? new Date(now.getTime() + backfillIdleMs) : now,
                updatedAt: now,
            })
            .where(eq(discoverySourceScans.key, backfillKey));
        return { scanned: rows.length, registered };
    });

// Operator counts: all prefixes, those expanded through autocomplete and those still waiting.
export const readKeywordPrefixCounts = async () => {
    const [counts] = await db
        .select({
            total: sql<number>`count(*)::int`,
            expanded: sql<number>`count(*) filter (where ${keywordPrefixes.stage}='complete')::int`,
        })
        .from(keywordPrefixes)
        .where(eq(keywordPrefixes.marketplaceId, marketplaceId));
    const total = counts?.total ?? 0;
    const expanded = counts?.expanded ?? 0;
    return { total, expanded, pending: total - expanded };
};
