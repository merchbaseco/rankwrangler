import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, catalogSearchRuns, operations } from '@/db/schema';
import { deriveCatalogQueryStatus } from '@/services/catalog-query-refresh-policy';
import type { CatalogSearchTrigger } from '@/services/operations';

const CATALOG_SOURCE = 'keepa' as const;

/**
 * One Catalog query with its latest page-one run, latest Catalog-search Operation and page-one
 * run count, in one statement: each lateral reads one query's rows through an index.
 */
export const getCatalogQuery = async (normalizedTerm: string, now = new Date()) => {
    const latestRun = db
        .select()
        .from(catalogSearchRuns)
        .where(and(eq(catalogSearchRuns.queryId, catalogQueries.id), eq(catalogSearchRuns.page, 0)))
        .orderBy(desc(catalogSearchRuns.sourceCompletedAt), desc(catalogSearchRuns.id))
        .limit(1)
        .as('latest_run');
    const latestOperation = db
        .select({
            status: operations.status,
            error: operations.error,
            completedAt: operations.completedAt,
        })
        .from(operations)
        .where(
            and(
                eq(operations.type, 'catalogSearch'),
                eq(operations.targetKey, sql`${catalogQueries.id}::text`)
            )
        )
        .orderBy(desc(operations.updatedAt), desc(operations.id))
        .limit(1)
        .as('latest_operation');
    const [row] = await db
        .select({
            query: catalogQueries,
            latestRun: {
                id: latestRun.id,
                queryId: latestRun.queryId,
                page: latestRun.page,
                operationId: latestRun.operationId,
                sourceStartedAt: latestRun.sourceStartedAt,
                sourceCompletedAt: latestRun.sourceCompletedAt,
                trigger: latestRun.trigger,
                resultCount: latestRun.resultCount,
                normalizerVersion: latestRun.normalizerVersion,
                createdAt: latestRun.createdAt,
            },
            latestOperation: {
                status: latestOperation.status,
                error: latestOperation.error,
                completedAt: latestOperation.completedAt,
            },
            observationCount: sql<number>`(
                select count(*) from ${catalogSearchRuns}
                where ${catalogSearchRuns.queryId} = ${catalogQueries.id}
                    and ${catalogSearchRuns.page} = 0
            )::int`,
        })
        .from(catalogQueries)
        .leftJoinLateral(latestRun, sql`true`)
        .leftJoinLateral(latestOperation, sql`true`)
        .where(
            and(
                eq(catalogQueries.source, CATALOG_SOURCE),
                eq(catalogQueries.marketplaceId, 'ATVPDKIKX0DER'),
                eq(catalogQueries.normalizedTerm, normalizedTerm)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }

    return mapCatalogQuery({
        query: row.query,
        latestOperation: row.latestOperation,
        latestRun: row.latestRun,
        observationCount: row.observationCount ?? 0,
        now,
    });
};

export const mapCatalogRunMetadata = (run: typeof catalogSearchRuns.$inferSelect) => ({
    id: run.id,
    sourceStartedAt: run.sourceStartedAt.toISOString(),
    sourceCompletedAt: run.sourceCompletedAt.toISOString(),
    trigger: run.trigger as CatalogSearchTrigger,
    resultCount: run.resultCount,
    normalizerVersion: run.normalizerVersion,
    createdAt: run.createdAt.toISOString(),
});

type LatestOperation = Pick<typeof operations.$inferSelect, 'status' | 'error' | 'completedAt'>;

const mapCatalogQuery = ({
    query,
    latestOperation,
    latestRun,
    observationCount,
    now,
}: {
    query: typeof catalogQueries.$inferSelect;
    latestOperation: LatestOperation | null;
    latestRun: typeof catalogSearchRuns.$inferSelect | null;
    observationCount: number;
    now: Date;
}) => {
    const hasFailedOperation =
        latestOperation?.status === 'completed' &&
        latestOperation.error !== null &&
        (!(query.latestSuccessfulRunAt && latestOperation.completedAt) ||
            latestOperation.completedAt > query.latestSuccessfulRunAt);

    return {
        id: query.id,
        source: CATALOG_SOURCE,
        marketplaceId: query.marketplaceId,
        normalizedTerm: query.normalizedTerm,
        displayTerm: query.displayTerm,
        page: 0,
        tier: query.tier,
        admissionReason: query.admissionReason,
        lastRequestedAt: query.lastRequestedAt?.toISOString() ?? null,
        activeUntil: query.activeUntil?.toISOString() ?? null,
        latestSuccessfulRunAt: query.latestSuccessfulRunAt?.toISOString() ?? null,
        nextRefreshAttemptAt: query.nextRefreshAttemptAt?.toISOString() ?? null,
        lastRefreshAttemptAt: query.lastRefreshAttemptAt?.toISOString() ?? null,
        nextRefreshAt: getNextCatalogRefreshAt(query, now)?.toISOString() ?? null,
        status: deriveCatalogQueryStatus({
            tier: query.tier,
            nextDueAt: query.nextDueAt,
            activeUntil: query.activeUntil,
            latestSuccessfulRunAt: query.latestSuccessfulRunAt,
            nextRefreshAttemptAt: query.nextRefreshAttemptAt,
            hasPendingOperation: latestOperation?.status === 'pending',
            hasFailedOperation,
            now,
        }),
        observationCount,
        latestRun: latestRun ? mapCatalogRunMetadata(latestRun) : null,
    };
};

const getNextCatalogRefreshAt = (query: typeof catalogQueries.$inferSelect, now: Date) => {
    if (query.tier === 'stored') return null;
    return new Date(
        Math.max(
            now.getTime(),
            query.nextDueAt?.getTime() ?? now.getTime(),
            query.nextRefreshAttemptAt?.getTime() ?? 0
        )
    );
};
