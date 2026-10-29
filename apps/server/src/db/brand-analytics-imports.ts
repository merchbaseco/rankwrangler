import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import {
    BRAND_ANALYTICS_MARKETPLACE_ID,
    type BrandAnalyticsTerm,
    latestBrandAnalyticsWeek,
} from '@/services/brand-analytics-terms';
import { brandAnalyticsImports, brandAnalyticsSearchTerms } from './brand-analytics-schema';
import { db } from './index';

const active = ['pending', 'requested', 'ready'] as const;
// Longer than the slowest step (downloading and parsing a weekly report), so a live import is never
// claimed twice; a crashed one is picked up again after it.
const leaseMs = 90 * 60_000;
const upsertBatch = 1000;

export type BrandAnalyticsImport = typeof brandAnalyticsImports.$inferSelect;
export type BrandAnalyticsImportWork = BrandAnalyticsImport & { claimToken: string };

// Makes sure the latest publishable week has an import row and returns it when its next step is
// due. Older unfinished weeks are superseded once no job holds them: only the latest week is
// imported, but a download already under way may finish.
export const ensureBrandAnalyticsImport = async (now = new Date()) =>
    db.transaction(async tx => {
        const week = latestBrandAnalyticsWeek(now);
        await tx
            .insert(brandAnalyticsImports)
            .values({ marketplaceId: BRAND_ANALYTICS_MARKETPLACE_ID, ...week, nextAttemptAt: now })
            .onConflictDoNothing();
        await tx
            .update(brandAnalyticsImports)
            .set({ status: 'superseded', updatedAt: now })
            .where(
                and(
                    eq(brandAnalyticsImports.marketplaceId, BRAND_ANALYTICS_MARKETPLACE_ID),
                    ne(brandAnalyticsImports.weekStart, week.weekStart),
                    inArray(brandAnalyticsImports.status, [...active]),
                    unclaimed(now)
                )
            );
        const [due] = await tx
            .select({ id: brandAnalyticsImports.id })
            .from(brandAnalyticsImports)
            .where(
                and(
                    eq(brandAnalyticsImports.marketplaceId, BRAND_ANALYTICS_MARKETPLACE_ID),
                    eq(brandAnalyticsImports.weekStart, week.weekStart),
                    dueCondition(now)
                )
            );
        return due ?? null;
    });

export const claimBrandAnalyticsImport = async (id: string, now = new Date()) =>
    db.transaction(async tx => {
        const [row] = await tx
            .select()
            .from(brandAnalyticsImports)
            .where(and(eq(brandAnalyticsImports.id, id), dueCondition(now)))
            .for('update');
        if (!row) return null;
        const [claimed] = await tx
            .update(brandAnalyticsImports)
            .set({ claimToken: randomUUID(), claimAt: now, updatedAt: now })
            .where(eq(brandAnalyticsImports.id, id))
            .returning();
        return { ...claimed, claimToken: claimed.claimToken! };
    });

export type BrandAnalyticsImportPatch = Partial<
    Pick<
        BrandAnalyticsImport,
        | 'status'
        | 'reportId'
        | 'reportDocumentId'
        | 'reportStatus'
        | 'nextAttemptAt'
        | 'failureCount'
        | 'lastError'
        | 'requestedAt'
    >
>;

export const releaseBrandAnalyticsImport = async (
    work: BrandAnalyticsImportWork,
    patch: BrandAnalyticsImportPatch,
    now = new Date()
) => {
    await db
        .update(brandAnalyticsImports)
        .set({ ...patch, claimToken: null, claimAt: null, updatedAt: now })
        .where(ownedBy(work));
};

// Upserts the week's kept terms and finishes the import in one transaction. A term keeps its first
// week; rank, clicks and last week move only forward. A week adds roughly 200k apparel-clicked
// terms plus the product-text terms, upserted 1,000 per statement.
export const saveBrandAnalyticsImport = async (
    work: BrandAnalyticsImportWork,
    result: { rows: number; terms: number; kept: readonly BrandAnalyticsTerm[] },
    now = new Date()
) =>
    db.transaction(async tx => {
        const [owned] = await tx
            .select()
            .from(brandAnalyticsImports)
            .where(ownedBy(work))
            .for('update');
        if (!owned) throw new Error('Brand Analytics import claim expired');
        let newTerms = 0;
        for (let start = 0; start < result.kept.length; start += upsertBatch) {
            const inserted = await tx
                .insert(brandAnalyticsSearchTerms)
                .values(
                    result.kept.slice(start, start + upsertBatch).map(term => ({
                        marketplaceId: work.marketplaceId,
                        normalizedTerm: term.term,
                        searchFrequencyRank: term.rank,
                        apparelClicks: term.apparelClicks,
                        merchProductText: term.merchProductText,
                        prefix: term.prefix,
                        clickedAsins: term.clickedAsins,
                        firstSeenWeek: work.weekStart,
                        lastSeenWeek: work.weekStart,
                        createdAt: now,
                        updatedAt: now,
                    }))
                )
                .onConflictDoUpdate({
                    target: [
                        brandAnalyticsSearchTerms.marketplaceId,
                        brandAnalyticsSearchTerms.normalizedTerm,
                    ],
                    set: {
                        searchFrequencyRank: newer(
                            sql`excluded.search_frequency_rank`,
                            'search_frequency_rank'
                        ),
                        apparelClicks: newer(sql`excluded.apparel_clicks`, 'apparel_clicks'),
                        // Both follow from the term text alone, so the latest rules apply.
                        merchProductText: sql`excluded.merch_product_text`,
                        prefix: sql`excluded.prefix`,
                        clickedAsins: newer(sql`excluded.clicked_asins`, 'clicked_asins'),
                        firstSeenWeek: sql`least(brand_analytics_search_terms.first_seen_week,excluded.first_seen_week)`,
                        lastSeenWeek: sql`greatest(brand_analytics_search_terms.last_seen_week,excluded.last_seen_week)`,
                        updatedAt: now,
                    },
                })
                .returning({ inserted: sql<boolean>`(xmax=0)` });
            newTerms += inserted.filter(row => row.inserted).length;
        }
        await tx
            .update(brandAnalyticsImports)
            .set({
                status: 'imported',
                rows: result.rows,
                terms: result.terms,
                keptTerms: result.kept.length,
                newTerms,
                importedAt: now,
                failureCount: 0,
                lastError: null,
                claimToken: null,
                claimAt: null,
                updatedAt: now,
            })
            .where(eq(brandAnalyticsImports.id, work.id));
        return { newTerms };
    });

// Operator status: the latest import, how many kept terms can become trials now, and how many
// product-text terms wait for their prefix.
export const readBrandAnalyticsStatus = async () => {
    const [[latest], [lastImported], [terms]] = await Promise.all([
        db
            .select()
            .from(brandAnalyticsImports)
            .orderBy(desc(brandAnalyticsImports.weekStart))
            .limit(1),
        db
            .select()
            .from(brandAnalyticsImports)
            .where(eq(brandAnalyticsImports.status, 'imported'))
            .orderBy(desc(brandAnalyticsImports.weekStart))
            .limit(1),
        db.execute<{ kept: number; unregistered: number; awaiting_prefix: number }>(sql`
            select count(*)::int kept,
                count(*) filter (where t.registered_at is null
                    and (t.apparel_clicks>=1 or k.id is not null))::int unregistered,
                count(*) filter (where t.registered_at is null and t.apparel_clicks=0
                    and k.id is null)::int awaiting_prefix
            from brand_analytics_search_terms t
            left join keyword_prefixes k on k.marketplace_id=t.marketplace_id and k.prefix=t.prefix`),
    ]);
    return { latest: latest ?? null, lastImported: lastImported ?? null, terms };
};

const unclaimed = (now: Date) =>
    or(
        isNull(brandAnalyticsImports.claimAt),
        lte(brandAnalyticsImports.claimAt, new Date(now.getTime() - leaseMs))
    );

const dueCondition = (now: Date) =>
    and(
        inArray(brandAnalyticsImports.status, [...active]),
        lte(brandAnalyticsImports.nextAttemptAt, now),
        unclaimed(now)
    );

const ownedBy = (work: BrandAnalyticsImportWork) =>
    and(
        eq(brandAnalyticsImports.id, work.id),
        eq(brandAnalyticsImports.claimToken, work.claimToken)
    );

const newer = (incoming: ReturnType<typeof sql>, column: string) =>
    sql`case when excluded.last_seen_week>=brand_analytics_search_terms.last_seen_week then ${incoming} else ${sql.raw(`brand_analytics_search_terms.${column}`)} end`;
