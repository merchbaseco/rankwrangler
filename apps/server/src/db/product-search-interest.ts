import { researchDiscoveryScopes } from '@/services/discovery-candidate-policy';
import { recordDiscoveryCandidates } from './discovery-candidates';
import { discoveryTargets } from './discovery-target-schema';
import { and, desc, eq } from 'drizzle-orm';
import { keywordExplorationPasses } from './keyword-collection-schema';
import type { ProductSearchInput } from '@/api/product-search-input';
import { catalogQueries } from './catalog-search-schema';
import { db } from './index';

export const recordProductSearchInterest = async (input: ProductSearchInput) => {
    if (
        !input.term ||
        (input.marketplaceIds.length && !input.marketplaceIds.includes('ATVPDKIKX0DER'))
    ) {
        return null;
    }
    const displayTerm = input.term.trim().replace(/\s+/g, ' ');
    const scopes = researchDiscoveryScopes(displayTerm);
    if (!scopes.length) return null;
    const now = new Date();
    const query = await db.transaction(async tx => {
        const [query] = await tx
            .insert(catalogQueries)
            .values({
                source: 'keepa',
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: displayTerm.toLowerCase(),
                displayTerm,
                lastRequestedAt: now,
            })
            .onConflictDoUpdate({
                target: [
                    catalogQueries.source,
                    catalogQueries.marketplaceId,
                    catalogQueries.normalizedTerm,
                ],
                set: { lastRequestedAt: now, displayTerm, updatedAt: now },
            })
            .returning({
                id: catalogQueries.id,
                headCheckedAt: catalogQueries.latestSuccessfulRunAt,
            });
        await recordDiscoveryCandidates(
            tx,
            scopes.map(scope => ({
                scope,
                evidence: {
                    kind: 'interest',
                    sourceKey:
                        scope.term.toLowerCase() === displayTerm.toLowerCase()
                            ? 'request'
                            : `related:${query.id}`,
                    observedAt: now,
                },
            }))
        );
        return query;
    });
    const [observation] = query
        ? await db
              .select({ pass: keywordExplorationPasses })
              .from(keywordExplorationPasses)
              .innerJoin(
                  discoveryTargets,
                  eq(discoveryTargets.id, keywordExplorationPasses.targetId)
              )
              .where(
                  and(eq(discoveryTargets.queryId, query.id), eq(discoveryTargets.kind, 'keyword'))
              )
              .orderBy(desc(keywordExplorationPasses.createdAt))
              .limit(1)
        : [];
    const pass = observation?.pass;
    return {
        keyword: displayTerm,
        headCheckedAt: query?.headCheckedAt?.toISOString() ?? null,
        exploration: pass
            ? {
                  source: 'spapi' as const,
                  pages: pass.contiguousPages,
                  observedAt: pass.oldestPageAt?.toISOString() ?? null,
                  budgetLimited: pass.stopReason === 'budget',
              }
            : null,
    };
};
