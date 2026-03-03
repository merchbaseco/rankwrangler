import type { TopSearchTermsDatasetRecord } from '@/db/top-search-terms/dataset-record.js';
import type { TopSearchTermsWindow } from '@/db/top-search-terms/types.js';

export const TOP_SEARCH_TERMS_DAILY_RETENTION_DAYS = 90;
export const TOP_SEARCH_TERMS_WEEKLY_BACKFILL_WEEKS = 52;
export const TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE = 6;
export const TOP_SEARCH_TERMS_RETRY_DELAY_MS = 30 * 60 * 1000;

export const buildDailyTopSearchTermsWindows = ({
    marketplaceId,
    today,
    days,
}: {
    marketplaceId: string;
    today: string;
    days: number;
}): TopSearchTermsWindow[] => {
    const windows: TopSearchTermsWindow[] = [];
    for (let index = 0; index < days; index += 1) {
        const day = shiftDateString(today, -index);
        windows.push({
            marketplaceId,
            reportPeriod: 'DAY',
            dataStartDate: day,
            dataEndDate: day,
        });
    }

    return windows;
};

export const buildWeeklyTopSearchTermsWindows = ({
    marketplaceId,
    today,
    weeks,
}: {
    marketplaceId: string;
    today: string;
    weeks: number;
}): TopSearchTermsWindow[] => {
    const currentWeekStart = getMondayStartOfWeek(today);
    const windows: TopSearchTermsWindow[] = [];

    for (let index = 0; index < weeks; index += 1) {
        const weekStart = shiftDateString(currentWeekStart, -(index * 7));
        windows.push({
            marketplaceId,
            reportPeriod: 'WEEK',
            dataStartDate: weekStart,
            dataEndDate: shiftDateString(weekStart, 6),
        });
    }

    return windows;
};

export const getDefaultTopSearchTermsWindow = ({
    marketplaceId,
    reportPeriod,
    today,
}: {
    marketplaceId: string;
    reportPeriod: TopSearchTermsWindow['reportPeriod'];
    today: string;
}): TopSearchTermsWindow => {
    if (reportPeriod === 'DAY') {
        return {
            marketplaceId,
            reportPeriod,
            dataStartDate: today,
            dataEndDate: today,
        };
    }

    const weekStart = getMondayStartOfWeek(today);
    return {
        marketplaceId,
        reportPeriod,
        dataStartDate: weekStart,
        dataEndDate: shiftDateString(weekStart, 6),
    };
};

export const getDailyRetentionCutoffDate = ({
    today,
    retentionDays,
}: {
    today: string;
    retentionDays: number;
}) => {
    return shiftDateString(today, -(retentionDays - 1));
};

export const getNextRefreshAtAfterSuccess = ({
    dataset,
    now,
    today,
}: {
    dataset: Pick<TopSearchTermsDatasetRecord, 'reportPeriod' | 'dataEndDate'>;
    now: Date;
    today: string;
}): Date | null => {
    if (dataset.reportPeriod === 'DAY') {
        return dataset.dataEndDate >= today ? new Date(now.getTime() + 6 * 60 * 60 * 1000) : null;
    }

    return dataset.dataEndDate >= today ? new Date(now.getTime() + 12 * 60 * 60 * 1000) : null;
};

export const getRetryRefreshAt = (failedAt: Date) => {
    return new Date(failedAt.getTime() + TOP_SEARCH_TERMS_RETRY_DELAY_MS);
};

const getMondayStartOfWeek = (dateString: string) => {
    const current = parseDateString(dateString);
    const day = current.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return formatDateString(new Date(current.getTime() + mondayOffset * DAY_MS));
};

const shiftDateString = (dateString: string, deltaDays: number) => {
    const date = parseDateString(dateString);
    return formatDateString(new Date(date.getTime() + deltaDays * DAY_MS));
};

const parseDateString = (dateString: string) => {
    return new Date(`${dateString}T00:00:00Z`);
};

const formatDateString = (date: Date) => {
    return date.toISOString().slice(0, 10);
};

const DAY_MS = 24 * 60 * 60 * 1000;
