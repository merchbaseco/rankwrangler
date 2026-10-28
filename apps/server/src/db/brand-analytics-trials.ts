import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { BRAND_ANALYTICS_MARKETPLACE_ID } from '@/services/brand-analytics-terms';
import { brandAnalyticsSearchTerms as terms } from './brand-analytics-schema';
import { recordDiscoveryCandidates } from './discovery-candidates';
import { db } from './index';

// Registers the most searched kept Brand Analytics terms that are not yet keywords as trials, with
// eligible `brandAnalytics` evidence naming the report week. Existing keywords keep their tracking
// (a dormant keyword stays dormant); they only gain the evidence.
export const registerBrandAnalyticsTrials = async (limit: number, now = new Date()) =>
    db.transaction(async tx => {
        if (limit <= 0) return 0;
        const rows = await tx
            .select({ term: terms.normalizedTerm, week: terms.lastSeenWeek })
            .from(terms)
            .where(
                and(
                    eq(terms.marketplaceId, BRAND_ANALYTICS_MARKETPLACE_ID),
                    isNull(terms.registeredAt)
                )
            )
            .orderBy(asc(terms.searchFrequencyRank), asc(terms.normalizedTerm))
            .limit(limit)
            .for('update', { skipLocked: true });
        if (!rows.length) return 0;
        await recordDiscoveryCandidates(
            tx,
            rows.map(row => ({
                scope: { kind: 'keyword' as const, term: row.term },
                evidence: {
                    kind: 'brandAnalytics' as const,
                    sourceKey: `week:${row.week}`,
                    observedAt: now,
                },
            }))
        );
        await tx
            .update(terms)
            .set({ registeredAt: now })
            .where(
                and(
                    eq(terms.marketplaceId, BRAND_ANALYTICS_MARKETPLACE_ID),
                    inArray(
                        terms.normalizedTerm,
                        rows.map(row => row.term)
                    )
                )
            );
        return rows.length;
    });
