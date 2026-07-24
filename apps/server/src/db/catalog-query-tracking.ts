import { and, asc, eq, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries } from '@/db/schema';
import { lockCatalogQueryForReconciliation } from './catalog-search';

export const setCatalogQueryTracking = async ({
    normalizedTerm,
    enabled,
    now = new Date(),
}: {
    normalizedTerm: string;
    enabled: boolean;
    now?: Date;
}) => {
    return await db.transaction(async transaction => {
        const [existing] = await transaction
            .select({ id: catalogQueries.id })
            .from(catalogQueries)
            .where(
                and(
                    eq(catalogQueries.source, 'keepa'),
                    eq(catalogQueries.marketplaceId, 'ATVPDKIKX0DER'),
                    eq(catalogQueries.normalizedTerm, normalizedTerm),
                    eq(catalogQueries.page, 0)
                )
            )
            .limit(1);
        if (!existing) {
            return null;
        }
        await lockCatalogQueryForReconciliation(transaction, existing.id);
        const [query] = await transaction
            .update(catalogQueries)
            .set({
                trackedAt: enabled ? now : null,
                nextTrackingAttemptAt: null,
                updatedAt: now,
            })
            .where(eq(catalogQueries.id, existing.id))
            .returning({
                id: catalogQueries.id,
                trackedAt: catalogQueries.trackedAt,
            });

        return query ?? null;
    });
};

export const listDueTrackedCatalogQueries = async ({
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
                isNotNull(catalogQueries.trackedAt),
                or(
                    isNull(catalogQueries.nextTrackingAttemptAt),
                    lte(catalogQueries.nextTrackingAttemptAt, now)
                ),
                or(
                    isNull(catalogQueries.latestSuccessfulRunAt),
                    lte(catalogQueries.latestSuccessfulRunAt, dueAtOrBefore)
                )
            )
        )
        .orderBy(
            asc(catalogQueries.latestSuccessfulRunAt),
            asc(catalogQueries.createdAt),
            asc(catalogQueries.id)
        )
        .limit(limit);
};
