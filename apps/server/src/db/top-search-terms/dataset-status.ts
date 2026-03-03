import { eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { mapDatasetRecord } from '@/db/top-search-terms/dataset-record.js';
import { topSearchTermsDatasets } from '@/db/top-search-terms-schema.js';
import type { TopSearchTermsDatasetStatus } from '@/db/top-search-terms/types.js';

export const setTopSearchTermsDatasetQueued = async ({
    datasetId,
    jobId,
    requestedAt = new Date(),
}: {
    datasetId: string;
    jobId: string;
    requestedAt?: Date;
}) => {
    return await updateTopSearchTermsDatasetStatus(datasetId, {
        activeJobId: jobId,
        activeJobRequestedAt: requestedAt,
        fetchStartedAt: null,
        lastError: null,
        refreshing: true,
        status: 'queued',
        updatedAt: requestedAt,
    });
};

export const setTopSearchTermsDatasetInProgress = async ({
    datasetId,
    jobId,
    startedAt = new Date(),
}: {
    datasetId: string;
    jobId: string;
    startedAt?: Date;
}) => {
    return await updateTopSearchTermsDatasetStatus(datasetId, {
        activeJobId: jobId,
        fetchStartedAt: startedAt,
        lastError: null,
        status: 'in_progress',
        updatedAt: startedAt,
    });
};

export const setTopSearchTermsDatasetCompleted = async ({
    datasetId,
    completedAt = new Date(),
    reportId,
    nextRefreshAt,
}: {
    datasetId: string;
    completedAt?: Date;
    reportId: string;
    nextRefreshAt: Date | null;
}) => {
    return await updateTopSearchTermsDatasetStatus(datasetId, {
        activeJobId: null,
        lastCompletedAt: completedAt,
        lastError: null,
        nextRefreshAt,
        refreshing: false,
        reportId,
        status: 'completed',
        updatedAt: completedAt,
    });
};

export const setTopSearchTermsDatasetFailed = async ({
    datasetId,
    errorMessage,
    failedAt = new Date(),
    nextRefreshAt,
}: {
    datasetId: string;
    errorMessage: string;
    failedAt?: Date;
    nextRefreshAt: Date;
}) => {
    return await updateTopSearchTermsDatasetStatus(datasetId, {
        activeJobId: null,
        lastError: errorMessage,
        lastFailedAt: failedAt,
        nextRefreshAt,
        refreshing: false,
        status: 'failed',
        updatedAt: failedAt,
    });
};

const updateTopSearchTermsDatasetStatus = async (
    datasetId: string,
    changes: Partial<typeof topSearchTermsDatasets.$inferInsert> & {
        status: TopSearchTermsDatasetStatus;
        updatedAt: Date;
    }
) => {
    const [row] = await db
        .update(topSearchTermsDatasets)
        .set(changes)
        .where(eq(topSearchTermsDatasets.id, datasetId))
        .returning();

    return row ? mapDatasetRecord(row) : null;
};
