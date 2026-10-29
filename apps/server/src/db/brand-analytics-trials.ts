import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { BRAND_ANALYTICS_MARKETPLACE_ID } from '@/services/brand-analytics-terms';
import { brandAnalyticsSearchTerms as terms } from './brand-analytics-schema';
import { recordDiscoveryCandidates } from './discovery-candidates';
import { db } from './index';
import { keywordPrefixes } from './keyword-prefix-schema';

// Registers the most searched kept Brand Analytics terms that are not yet keywords as trials, with
// eligible `brandAnalytics` evidence naming the report week. A term with an apparel click always
// qualifies; a term kept only because its text names a Merch product qualifies once its prefix is a
// registered keyword prefix, so it is picked up whenever that prefix appears. Existing keywords
// keep their tracking (a dormant keyword stays dormant); they only gain the evidence.
export const registerBrandAnalyticsTrials = async (limit: number, now = new Date()) =>
    db.transaction(async tx => {
        if (limit <= 0) return 0;
        const selection = {
            term: terms.normalizedTerm,
            week: terms.lastSeenWeek,
            rank: terms.searchFrequencyRank,
        };
        const unregistered = and(
            eq(terms.marketplaceId, BRAND_ANALYTICS_MARKETPLACE_ID),
            isNull(terms.registeredAt)
        );
        const apparel = await tx
            .select(selection)
            .from(terms)
            .where(and(unregistered, gte(terms.apparelClicks, 1)))
            .orderBy(asc(terms.searchFrequencyRank), asc(terms.normalizedTerm))
            .limit(limit)
            .for('update', { skipLocked: true });
        const prefixed = await tx
            .select(selection)
            .from(terms)
            .innerJoin(
                keywordPrefixes,
                and(
                    eq(keywordPrefixes.marketplaceId, terms.marketplaceId),
                    eq(keywordPrefixes.prefix, terms.prefix)
                )
            )
            .where(and(unregistered, eq(terms.apparelClicks, 0)))
            .orderBy(asc(terms.searchFrequencyRank), asc(terms.normalizedTerm))
            .limit(limit)
            .for('update', { of: terms, skipLocked: true });
        const rows = [...apparel, ...prefixed]
            .sort((a, b) => a.rank - b.rank || a.term.localeCompare(b.term))
            .slice(0, limit);
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
