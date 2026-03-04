import type { TopSearchTermsDatasetRecord } from '@/db/top-search-terms/dataset-record.js';
import type { TopSearchTermsWindow } from '@/db/top-search-terms/types.js';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const TOP_SEARCH_TERMS_DAILY_RETENTION_DAYS = 90;
export const TOP_SEARCH_TERMS_WEEKLY_BACKFILL_WEEKS = 52;
export const TOP_SEARCH_TERMS_SCHEDULER_BATCH_SIZE = 1;
export const TOP_SEARCH_TERMS_RETRY_DELAY_MS = 30 * 60 * 1000;
export const TOP_SEARCH_TERMS_PACIFIC_REFRESH_HOUR = 3;

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
    if (dataset.dataEndDate < today) {
        return null;
    }

    const scheduledRefreshAt = getSlaAlignedRefreshAt({
        reportPeriod: dataset.reportPeriod,
        dataEndDate: dataset.dataEndDate,
    });
    return scheduledRefreshAt.getTime() > now.getTime() ? scheduledRefreshAt : null;
};

export const getRetryRefreshAt = (failedAt: Date) => {
    return new Date(failedAt.getTime() + TOP_SEARCH_TERMS_RETRY_DELAY_MS);
};

export const getInitialNextRefreshAtForWindow = ({
    window,
    now,
    today,
}: {
    window: TopSearchTermsWindow;
    now: Date;
    today: string;
}) => {
    if (window.dataEndDate < today) {
        return now;
    }

    const scheduledRefreshAt = getSlaAlignedRefreshAt({
        reportPeriod: window.reportPeriod,
        dataEndDate: window.dataEndDate,
    });
    return scheduledRefreshAt.getTime() > now.getTime() ? scheduledRefreshAt : now;
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

const getSlaAlignedRefreshAt = ({
    reportPeriod,
    dataEndDate,
}: Pick<TopSearchTermsWindow, 'reportPeriod' | 'dataEndDate'>) => {
    const availabilityDate = getDatasetAvailabilityDate({
        reportPeriod,
        dataEndDate,
    });
    const availabilityEndOfDay = fromZonedTime(
        `${availabilityDate}T23:59:59.999`,
        PACIFIC_TIME_ZONE
    );

    return getNextPacificRefreshAtOrAfter(availabilityEndOfDay);
};

const getDatasetAvailabilityDate = ({
    reportPeriod,
    dataEndDate,
}: Pick<TopSearchTermsWindow, 'reportPeriod' | 'dataEndDate'>) => {
    if (reportPeriod === 'DAY') {
        const delayDays = isSaturday(dataEndDate)
            ? SATURDAY_DAILY_AVAILABILITY_DELAY_DAYS
            : NON_SATURDAY_DAILY_AVAILABILITY_DELAY_DAYS;
        return shiftDateString(dataEndDate, delayDays);
    }

    return shiftDateString(dataEndDate, WEEKLY_AVAILABILITY_DELAY_DAYS);
};

const getNextPacificRefreshAtOrAfter = (date: Date) => {
    const pacificDate = formatInTimeZone(date, PACIFIC_TIME_ZONE, 'yyyy-MM-dd');
    const sameDayRefresh = getPacificRefreshSlot(pacificDate);
    if (sameDayRefresh.getTime() > date.getTime()) {
        return sameDayRefresh;
    }

    const nextDay = shiftDateString(pacificDate, 1);
    return getPacificRefreshSlot(nextDay);
};

const getPacificRefreshSlot = (dateString: string) => {
    const hour = String(TOP_SEARCH_TERMS_PACIFIC_REFRESH_HOUR).padStart(2, '0');
    return fromZonedTime(`${dateString}T${hour}:00:00.000`, PACIFIC_TIME_ZONE);
};

const isSaturday = (dateString: string) => {
    return parseDateString(dateString).getUTCDay() === 6;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
const NON_SATURDAY_DAILY_AVAILABILITY_DELAY_DAYS = 3;
const SATURDAY_DAILY_AVAILABILITY_DELAY_DAYS = 2;
const WEEKLY_AVAILABILITY_DELAY_DAYS = 2;
