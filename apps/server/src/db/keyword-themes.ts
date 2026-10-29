import { and, asc, eq, sql } from 'drizzle-orm';
import { extractKeywordTheme } from '@/services/keyword-theme';
import { catalogQueries } from './catalog-search-schema';
import { discoverySourceScans, discoveryTargets } from './discovery-target-schema';
import { db } from './index';
import { keywordThemes } from './keyword-theme-schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const marketplaceId = 'ATVPDKIKX0DER';
const backfillKey = 'keyword-themes';
// Once the backfill reaches the newest tracked keyword it only re-checks daily; graduation and
// user tracking register themes as they happen.
const backfillIdleMs = 86_400_000;

// Registers the themes of newly tracked US keywords. One row per theme; known themes are ignored.
export const registerKeywordThemes = async (
    tx: Transaction,
    keywords: readonly { queryId: string; term: string; marketplaceId: string }[],
    now = new Date()
) => {
    const themes = new Map<string, string>();
    for (const keyword of keywords) {
        if (keyword.marketplaceId !== marketplaceId) continue;
        const theme = extractKeywordTheme(keyword.term);
        if (theme && !themes.has(theme)) themes.set(theme, keyword.queryId);
    }
    if (!themes.size) return 0;
    const inserted = await tx
        .insert(keywordThemes)
        .values(
            [...themes]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([theme, firstQueryId]) => ({
                    marketplaceId,
                    theme,
                    firstQueryId,
                    nextDueAt: now,
                    createdAt: now,
                }))
        )
        .onConflictDoNothing()
        .returning({ id: keywordThemes.id });
    return inserted.length;
};

// Registers the themes of keywords that were already tracked before themes existed, one bounded
// batch per call, by a cursor over tracked keyword targets in creation order.
export const backfillKeywordThemes = async (limit: number, now = new Date()) =>
    db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-themes-backfill'))`);
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
        const registered = await registerKeywordThemes(tx, rows, now);
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

// Operator counts: all themes, those expanded through autocomplete and those still waiting.
export const readKeywordThemeCounts = async () => {
    const [counts] = await db
        .select({
            total: sql<number>`count(*)::int`,
            expanded: sql<number>`count(*) filter (where ${keywordThemes.stage}='complete')::int`,
        })
        .from(keywordThemes)
        .where(eq(keywordThemes.marketplaceId, marketplaceId));
    const total = counts?.total ?? 0;
    const expanded = counts?.expanded ?? 0;
    return { total, expanded, pending: total - expanded };
};
