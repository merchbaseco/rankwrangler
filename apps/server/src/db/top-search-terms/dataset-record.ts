import type {
    TopSearchTermsDatasetStatus,
    TopSearchTermsRefreshTrigger,
    TopSearchTermsReportPeriod,
} from '@/db/top-search-terms/types.js';
import type { topSearchTermsDatasets } from '@/db/top-search-terms-schema.js';

export interface TopSearchTermsDatasetRecord {
    id: string;
    marketplaceId: string;
    reportPeriod: TopSearchTermsReportPeriod;
    dataStartDate: string;
    dataEndDate: string;
    status: TopSearchTermsDatasetStatus;
    refreshing: boolean;
    activeJobId: string | null;
    activeJobRequestedAt: string | null;
    fetchStartedAt: string | null;
    lastCompletedAt: string | null;
    lastFailedAt: string | null;
    lastError: string | null;
    reportId: string | null;
    refreshTrigger: TopSearchTermsRefreshTrigger;
    nextRefreshAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export const mapDatasetRecord = (
    row: typeof topSearchTermsDatasets.$inferSelect
): TopSearchTermsDatasetRecord => ({
    id: row.id,
    marketplaceId: row.marketplaceId,
    reportPeriod: normalizeReportPeriod(row.reportPeriod),
    dataStartDate: row.dataStartDate,
    dataEndDate: row.dataEndDate,
    status: normalizeDatasetStatus(row.status),
    refreshing: row.refreshing,
    activeJobId: row.activeJobId,
    activeJobRequestedAt: row.activeJobRequestedAt?.toISOString() ?? null,
    fetchStartedAt: row.fetchStartedAt?.toISOString() ?? null,
    lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    lastFailedAt: row.lastFailedAt?.toISOString() ?? null,
    lastError: row.lastError,
    reportId: row.reportId,
    refreshTrigger: normalizeRefreshTrigger(row.refreshTrigger),
    nextRefreshAt: row.nextRefreshAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

const normalizeDatasetStatus = (value: string): TopSearchTermsDatasetStatus => {
    if (
        value === 'queued' ||
        value === 'in_progress' ||
        value === 'completed' ||
        value === 'failed'
    ) {
        return value;
    }

    return 'idle';
};

const normalizeRefreshTrigger = (value: string): TopSearchTermsRefreshTrigger =>
    value === 'requested' ? 'requested' : 'automatic';

const normalizeReportPeriod = (value: string): TopSearchTermsReportPeriod => {
    if (value === 'DAY' || value === 'WEEK') {
        return value;
    }

    return 'DAY';
};
