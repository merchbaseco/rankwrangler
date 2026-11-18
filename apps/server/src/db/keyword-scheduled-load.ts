import { sql } from 'drizzle-orm';
import { catalogQueries } from './catalog-search-schema';
import type { db } from './index';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Admitted keywords: every tier but `stored`. `catalog_queries_scheduled_idx` holds only these
 * rows (a few hundred of the table's hundreds of thousands, bounded by Keepa admission), so a
 * statement filtered by this exact literal reads the index instead of the table. Keep the literal
 * inline (not a bound parameter) so the planner can match the index predicate.
 */
export const scheduledKeyword = sql`${catalogQueries.tier} <> 'stored'`;

/**
 * The daily Keepa head cost of every admitted keyword at its current interval, and how many have
 * never been observed, in one read of the admitted rows.
 */
export const readScheduledKeywordLoad = async (tx: Transaction, headCost: number) => {
    const [row] = await tx
        .select({
            daily: sql<number>`coalesce(sum(${headCost}::numeric / greatest(${catalogQueries.intervalDays}, 1)), 0)::float`,
            unobserved: sql<number>`(count(*) filter (where ${catalogQueries.latestSuccessfulRunAt} is null))::int`,
        })
        .from(catalogQueries)
        .where(scheduledKeyword);
    return { daily: row?.daily ?? 0, unobserved: row?.unobserved ?? 0 };
};
