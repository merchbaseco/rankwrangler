import { and, asc, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries } from '@/db/schema';

export const listDueActiveCatalogQueries = async ({
    dueAtOrBefore,
    now,
    limit = 100,
}: {
    dueAtOrBefore: Date;
    now: Date;
    limit?: number;
}) => {
    return await db
        .select({
            id: catalogQueries.id,
            displayTerm: catalogQueries.displayTerm,
        })
        .from(catalogQueries)
        .where(
            and(
                gt(catalogQueries.activeUntil, now),
                or(
                    isNull(catalogQueries.nextRefreshAttemptAt),
                    lte(catalogQueries.nextRefreshAttemptAt, now)
                ),
                or(
                    isNull(catalogQueries.latestSuccessfulRunAt),
                    lte(catalogQueries.latestSuccessfulRunAt, dueAtOrBefore)
                )
            )
        )
        .orderBy(
            sql`${catalogQueries.latestSuccessfulRunAt} asc nulls first`,
            asc(catalogQueries.activeUntil),
            asc(catalogQueries.createdAt),
            asc(catalogQueries.id)
        )
        .limit(limit);
};
