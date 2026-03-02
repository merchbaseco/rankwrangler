import { and, eq } from 'drizzle-orm';
import { searchTermsFetchStatus } from '@/db/search-terms-schema.js';
import { db } from '@/db/index.js';

export type SearchTermsReportPeriod = 'MONTH' | 'WEEK';

export type SearchTermsWindow = {
    marketplaceId: string;
    reportPeriod: SearchTermsReportPeriod;
    dataStartDate: string;
    dataEndDate: string;
};

export type SearchTermsFetchStatusValue =
    | 'idle'
    | 'queued'
    | 'in_progress'
    | 'completed'
    | 'failed';

export type SearchTermsFetchStatusRecord = {
    status: SearchTermsFetchStatusValue;
    activeJobId: string | null;
    activeJobRequestedAt: string | null;
    fetchStartedAt: string | null;
    lastCompletedAt: string | null;
    lastFailedAt: string | null;
    lastError: string | null;
    lastCompletedSnapshotId: string | null;
    createdAt: string;
    updatedAt: string;
};

export const getSearchTermsFetchStatus = async (
    window: SearchTermsWindow
): Promise<SearchTermsFetchStatusRecord | null> => {
    const [row] = await db
        .select()
        .from(searchTermsFetchStatus)
        .where(getWindowWhere(window))
        .limit(1);

    return row ? mapStatusRecord(row) : null;
};

export const setSearchTermsFetchQueued = async ({
    window,
    jobId,
    requestedAt = new Date(),
}: {
    window: SearchTermsWindow;
    jobId: string;
    requestedAt?: Date;
}) => {
    return await upsertSearchTermsFetchStatus(window, {
        activeJobId: jobId,
        activeJobRequestedAt: requestedAt,
        fetchStartedAt: null,
        lastError: null,
        status: 'queued',
        updatedAt: requestedAt,
    });
};

export const setSearchTermsFetchInProgress = async ({
    window,
    jobId,
    startedAt = new Date(),
}: {
    window: SearchTermsWindow;
    jobId: string;
    startedAt?: Date;
}) => {
    return await upsertSearchTermsFetchStatus(window, {
        activeJobId: jobId,
        fetchStartedAt: startedAt,
        lastError: null,
        status: 'in_progress',
        updatedAt: startedAt,
    });
};

export const setSearchTermsFetchCompleted = async ({
    window,
    snapshotId,
    completedAt = new Date(),
}: {
    window: SearchTermsWindow;
    snapshotId: string;
    completedAt?: Date;
}) => {
    return await upsertSearchTermsFetchStatus(window, {
        activeJobId: null,
        lastCompletedAt: completedAt,
        lastCompletedSnapshotId: snapshotId,
        lastError: null,
        status: 'completed',
        updatedAt: completedAt,
    });
};

export const setSearchTermsFetchFailed = async ({
    window,
    errorMessage,
    failedAt = new Date(),
}: {
    window: SearchTermsWindow;
    errorMessage: string;
    failedAt?: Date;
}) => {
    return await upsertSearchTermsFetchStatus(window, {
        activeJobId: null,
        lastError: errorMessage,
        lastFailedAt: failedAt,
        status: 'failed',
        updatedAt: failedAt,
    });
};

const upsertSearchTermsFetchStatus = async (
    window: SearchTermsWindow,
    changes: Partial<typeof searchTermsFetchStatus.$inferInsert> & {
        status: SearchTermsFetchStatusValue;
        updatedAt: Date;
    }
) => {
    const [row] = await db
        .insert(searchTermsFetchStatus)
        .values({
            marketplaceId: window.marketplaceId,
            reportPeriod: window.reportPeriod,
            dataStartDate: window.dataStartDate,
            dataEndDate: window.dataEndDate,
            ...changes,
        })
        .onConflictDoUpdate({
            target: [
                searchTermsFetchStatus.marketplaceId,
                searchTermsFetchStatus.reportPeriod,
                searchTermsFetchStatus.dataStartDate,
                searchTermsFetchStatus.dataEndDate,
            ],
            set: {
                ...changes,
            },
        })
        .returning();

    return mapStatusRecord(row);
};

const getWindowWhere = (window: SearchTermsWindow) =>
    and(
        eq(searchTermsFetchStatus.marketplaceId, window.marketplaceId),
        eq(searchTermsFetchStatus.reportPeriod, window.reportPeriod),
        eq(searchTermsFetchStatus.dataStartDate, window.dataStartDate),
        eq(searchTermsFetchStatus.dataEndDate, window.dataEndDate)
    );

const mapStatusRecord = (
    row: typeof searchTermsFetchStatus.$inferSelect
): SearchTermsFetchStatusRecord => {
    return {
        activeJobId: row.activeJobId,
        activeJobRequestedAt: row.activeJobRequestedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        fetchStartedAt: row.fetchStartedAt?.toISOString() ?? null,
        lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
        lastCompletedSnapshotId: row.lastCompletedSnapshotId,
        lastError: row.lastError,
        lastFailedAt: row.lastFailedAt?.toISOString() ?? null,
        status: normalizeStatus(row.status),
        updatedAt: row.updatedAt.toISOString(),
    };
};

const normalizeStatus = (value: string): SearchTermsFetchStatusValue => {
    if (
        value === 'idle' ||
        value === 'queued' ||
        value === 'in_progress' ||
        value === 'completed' ||
        value === 'failed'
    ) {
        return value;
    }

    return 'idle';
};
