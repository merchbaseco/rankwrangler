import { desc, eq } from 'drizzle-orm';
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
    const now = new Date();
    const [query] = await db
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
        .returning({ id: catalogQueries.id, headCheckedAt: catalogQueries.latestSuccessfulRunAt });
    const [pass] = query
        ? await db
              .select()
              .from(keywordExplorationPasses)
              .where(eq(keywordExplorationPasses.queryId, query.id))
              .orderBy(desc(keywordExplorationPasses.createdAt))
              .limit(1)
        : [];
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
