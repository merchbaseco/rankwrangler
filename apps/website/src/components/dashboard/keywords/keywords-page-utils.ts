import { format, formatDistanceToNowStrict } from 'date-fns';
import type { SearchTermsWindowSelectionKey } from '@/components/dashboard/keywords/search-terms-window';

export type SearchTermsSummaryLike = {
    dataEndDate: string;
    dataStartDate: string;
    fetchedAt: string | null;
};

export const parseOptionalInteger = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric < 1) {
        return undefined;
    }

    return Math.floor(numeric);
};

export const getWindowLabel = (window: SearchTermsWindowSelectionKey) => {
    if (window === 'latest-day') {
        return 'Latest day';
    }

    if (window === 'last-complete-week') {
        return 'Last complete week';
    }

    return 'Custom';
};

const formatDateNice = (dateStr: string) => {
    const parsed = new Date(`${dateStr}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime())) {
        return dateStr;
    }
    return format(parsed, 'MMMM d, yyyy');
};

export const formatSummaryWindow = (summary: SearchTermsSummaryLike | null) => {
    if (!summary) {
        return '--';
    }

    if (summary.dataStartDate === summary.dataEndDate) {
        return formatDateNice(summary.dataStartDate);
    }

    return `${formatDateNice(summary.dataStartDate)} – ${formatDateNice(summary.dataEndDate)}`;
};

export const formatRefreshedAt = (fetchedAt: string | null) => {
    if (!fetchedAt) {
        return '--';
    }

    const parsed = new Date(fetchedAt);
    if (!Number.isFinite(parsed.getTime())) {
        return '--';
    }

    return `${parsed.toLocaleString()} (${formatDistanceToNowStrict(parsed, { addSuffix: true })})`;
};

export const getStaleDayCount = ({
    dataEndDate,
    activeWindow,
}: {
    dataEndDate: string | null;
    activeWindow: SearchTermsWindowSelectionKey;
}) => {
    if (activeWindow !== 'latest-day' || !dataEndDate) {
        return null;
    }

    const latestDatasetDate = new Date(`${dataEndDate}T00:00:00.000Z`);
    if (!Number.isFinite(latestDatasetDate.getTime())) {
        return null;
    }

    const pacificToday = getPacificDateString();
    const pacificTodayDate = new Date(`${pacificToday}T00:00:00.000Z`);
    const staleDays = Math.floor(
        (pacificTodayDate.getTime() - latestDatasetDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    return staleDays > 0 ? staleDays : null;
};

export const getStaleTooltip = (staleDays: number) =>
    `Amazon search term data is typically delayed by 2–3 days. This data is ${staleDays} day${staleDays === 1 ? '' : 's'} behind today.`;

const getPacificDateString = () => {
    const formatted = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
    }).formatToParts(new Date());
    const values = new Map(
        formatted
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
    );

    return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
};
