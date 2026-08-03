import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { catalogQueries, catalogSearchRuns, operations } from '@/db/schema';
import {
    CATALOG_QUERY_REFRESH_INTERVAL_MS,
    deriveCatalogQueryStatus,
} from '@/services/catalog-query-refresh-policy';
import type { CatalogSearchTrigger } from '@/services/operations';

const CATALOG_SOURCE = 'keepa' as const;

export const getCatalogQuery = async (normalizedTerm: string, now = new Date()) => {
    const [query] = await db
        .select()
        .from(catalogQueries)
        .where(
            and(
                eq(catalogQueries.source, CATALOG_SOURCE),
                eq(catalogQueries.marketplaceId, 'ATVPDKIKX0DER'),
                eq(catalogQueries.normalizedTerm, normalizedTerm),
                eq(catalogQueries.page, 0)
            )
        )
        .limit(1);
    if (!query) {
        return null;
    }

    const [latestRun] = await db
        .select()
        .from(catalogSearchRuns)
        .where(eq(catalogSearchRuns.queryId, query.id))
        .orderBy(desc(catalogSearchRuns.sourceCompletedAt), desc(catalogSearchRuns.id))
        .limit(1);
    const [latestOperation] = await db
        .select()
        .from(operations)
        .where(and(eq(operations.type, 'catalogSearch'), eq(operations.targetKey, query.id)))
        .orderBy(desc(operations.updatedAt), desc(operations.id))
        .limit(1);
    const [observationCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(catalogSearchRuns)
        .where(eq(catalogSearchRuns.queryId, query.id));

    return mapCatalogQuery({
        query,
        latestOperation: latestOperation ?? null,
        latestRun: latestRun ?? null,
        observationCount: observationCount?.count ?? 0,
        now,
    });
};

export const listCatalogQueries = async ({
    search,
    limit,
    now = new Date(),
}: {
    search?: string;
    limit: number;
    now?: Date;
}) => {
    const latestOperations = buildLatestCatalogOperations();
    const status = buildCatalogQueryStatusSql(latestOperations, now);
    const queryRows = await db
        .select({
            query: catalogQueries,
            latestOperation: {
                status: latestOperations.status,
                error: latestOperations.error,
                completedAt: latestOperations.completedAt,
            },
        })
        .from(catalogQueries)
        .leftJoin(
            latestOperations,
            sql`${latestOperations.targetKey} = ${catalogQueries.id}::text`
        )
        .where(search ? buildCatalogQuerySearch(search) : undefined)
        .orderBy(
            buildCatalogQueryStatusOrderSql(status),
            desc(catalogQueries.lastRequestedAt),
            desc(catalogQueries.id)
        )
        .limit(limit);
    const queryIds = queryRows.map(row => row.query.id);
    if (queryIds.length === 0) {
        return { items: [], summary: await loadCatalogQuerySummary({ search, now }) };
    }

    const [runCounts, summary] = await Promise.all([
        db
            .select({
                queryId: catalogSearchRuns.queryId,
                count: sql<number>`count(*)::int`,
            })
            .from(catalogSearchRuns)
            .where(inArray(catalogSearchRuns.queryId, queryIds))
            .groupBy(catalogSearchRuns.queryId),
        loadCatalogQuerySummary({ search, now }),
    ]);
    const counts = new Map(runCounts.map(row => [row.queryId, row.count]));
    const items = queryRows
        .map(row =>
            mapCatalogQuery({
                query: row.query,
                latestOperation: row.latestOperation,
                latestRun: null,
                observationCount: counts.get(row.query.id) ?? 0,
                now,
            })
        );

    return { items, summary };
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

type CatalogQueryView = ReturnType<typeof mapCatalogQuery>;
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
        page: query.page,
        lastRequestedAt: query.lastRequestedAt?.toISOString() ?? null,
        activeUntil: query.activeUntil?.toISOString() ?? null,
        latestSuccessfulRunAt: query.latestSuccessfulRunAt?.toISOString() ?? null,
        nextRefreshAttemptAt: query.nextRefreshAttemptAt?.toISOString() ?? null,
        lastRefreshAttemptAt: query.lastRefreshAttemptAt?.toISOString() ?? null,
        nextRefreshAt: getNextCatalogRefreshAt(query, now)?.toISOString() ?? null,
        status: deriveCatalogQueryStatus({
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

const buildCatalogQuerySearch = (search: string) => {
    const pattern = `%${escapeLikePattern(search.trim())}%`;
    return or(
        ilike(catalogQueries.displayTerm, pattern),
        ilike(catalogQueries.normalizedTerm, pattern)
    );
};

const getNextCatalogRefreshAt = (query: typeof catalogQueries.$inferSelect, now: Date) => {
    if (!query.activeUntil || query.activeUntil <= now) {
        return null;
    }
    if (query.nextRefreshAttemptAt && query.nextRefreshAttemptAt > now) {
        return query.nextRefreshAttemptAt;
    }
    if (query.latestSuccessfulRunAt) {
        return new Date(
            Math.max(
                now.getTime(),
                query.latestSuccessfulRunAt.getTime() + CATALOG_QUERY_REFRESH_INTERVAL_MS
            )
        );
    }
    return now;
};

const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const buildLatestCatalogOperations = () =>
    db
        .selectDistinctOn([operations.targetKey], {
            targetKey: operations.targetKey,
            status: operations.status,
            error: operations.error,
            completedAt: operations.completedAt,
        })
        .from(operations)
        .where(eq(operations.type, 'catalogSearch'))
        .orderBy(operations.targetKey, desc(operations.updatedAt), desc(operations.id))
        .as('latest_catalog_operations');

const buildCatalogQueryStatusSql = (
    latestOperation: ReturnType<typeof buildLatestCatalogOperations>,
    now: Date
) => {
    const dueAtOrBefore = new Date(now.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS);
    const expiringAtOrBefore = new Date(now.getTime() + CATALOG_QUERY_REFRESH_INTERVAL_MS);
    const nowParam = sql.param(now, catalogQueries.activeUntil);
    const dueParam = sql.param(dueAtOrBefore, catalogQueries.latestSuccessfulRunAt);
    const expiringParam = sql.param(expiringAtOrBefore, catalogQueries.activeUntil);
    return sql<CatalogQueryView['status']>`case
        when ${catalogQueries.activeUntil} is null or ${catalogQueries.activeUntil} <= ${nowParam}
            then 'inactive'
        when ${latestOperation.status} = 'pending' then 'pending'
        when ${latestOperation.status} = 'completed'
            and ${latestOperation.error} is not null
            and (${catalogQueries.latestSuccessfulRunAt} is null
                or ${latestOperation.completedAt} is null
                or ${latestOperation.completedAt} > ${catalogQueries.latestSuccessfulRunAt})
            then 'failed'
        when ${catalogQueries.nextRefreshAttemptAt} > ${nowParam} then 'deferred'
        when ${catalogQueries.latestSuccessfulRunAt} is null
            or ${catalogQueries.latestSuccessfulRunAt} <= ${dueParam}
            then 'due'
        when ${catalogQueries.activeUntil} <= ${expiringParam} then 'expiringSoon'
        else 'waiting'
    end`;
};

const buildCatalogQueryStatusOrderSql = (status: ReturnType<typeof buildCatalogQueryStatusSql>) =>
    sql`case ${status}
        when 'failed' then 0
        when 'due' then 1
        when 'pending' then 2
        when 'deferred' then 3
        when 'expiringSoon' then 4
        when 'waiting' then 5
        else 6
    end`;

const loadCatalogQuerySummary = async ({
    search,
    now,
}: {
    search?: string;
    now: Date;
}) => {
    const latestOperations = buildLatestCatalogOperations();
    const status = buildCatalogQueryStatusSql(latestOperations, now);
    const recentAfter = new Date(now.getTime() - CATALOG_QUERY_REFRESH_INTERVAL_MS);
    const nowParam = sql.param(now, catalogQueries.activeUntil);
    const recentParam = sql.param(recentAfter, catalogQueries.latestSuccessfulRunAt);
    const [summary] = await db
        .select({
            active: sql<number>`count(*) filter (
                where ${catalogQueries.activeUntil} > ${nowParam}
            )::int`,
            due: sql<number>`count(*) filter (where ${status} = 'due')::int`,
            refreshedRecently: sql<number>`count(*) filter (
                where ${catalogQueries.latestSuccessfulRunAt} > ${recentParam}
            )::int`,
            waitingOrDeferred: sql<number>`count(*) filter (
                where ${status} in ('waiting', 'deferred', 'pending')
            )::int`,
            failed: sql<number>`count(*) filter (where ${status} = 'failed')::int`,
            expiringSoon: sql<number>`count(*) filter (where ${status} = 'expiringSoon')::int`,
        })
        .from(catalogQueries)
        .leftJoin(
            latestOperations,
            sql`${latestOperations.targetKey} = ${catalogQueries.id}::text`
        )
        .where(search ? buildCatalogQuerySearch(search) : undefined);

    return {
        active: summary?.active ?? 0,
        due: summary?.due ?? 0,
        refreshedRecently: summary?.refreshedRecently ?? 0,
        waitingOrDeferred: summary?.waitingOrDeferred ?? 0,
        failed: summary?.failed ?? 0,
        expiringSoon: summary?.expiringSoon ?? 0,
    };
};
