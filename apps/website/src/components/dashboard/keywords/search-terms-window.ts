import { differenceInCalendarDays, format } from 'date-fns';

export const SEARCH_TERMS_WINDOW_PRESETS = [
    { key: 'latest-day', shortLabel: 'LATEST DAY' },
    { key: 'last-complete-week', shortLabel: 'LAST WEEK' },
] as const;

export type SearchTermsWindowPresetKey = (typeof SEARCH_TERMS_WINDOW_PRESETS)[number]['key'];
export type SearchTermsWindowSelectionKey = SearchTermsWindowPresetKey | 'custom';
export type SearchTermsCustomRange = [Date, Date] | null;
export type SearchTermsPickerRange = { from: Date | undefined; to?: Date | undefined } | undefined;

export type SearchTermsListWindowInput = {
    reportPeriod: 'DAY' | 'WEEK';
    dataStartDate?: string;
    dataEndDate?: string;
};

export const EMPTY_CUSTOM_WINDOW_ERROR = 'Select one day or a full Sunday-Saturday week.';
export const INVALID_CUSTOM_WINDOW_ERROR =
    'Custom range must be one day or a full Sunday-Saturday week.';

export const resolveSearchTermsListWindow = ({
    selection,
    customRange,
}: {
    selection: SearchTermsWindowSelectionKey;
    customRange: SearchTermsCustomRange;
}): {
    customWindowError: string | null;
    input: SearchTermsListWindowInput | null;
} => {
    if (selection === 'latest-day') {
        return {
            customWindowError: null,
            input: { reportPeriod: 'DAY' },
        };
    }

    if (selection === 'last-complete-week') {
        return {
            customWindowError: null,
            input: { reportPeriod: 'WEEK' },
        };
    }

    if (!customRange) {
        return {
            customWindowError: EMPTY_CUSTOM_WINDOW_ERROR,
            input: null,
        };
    }

    const [left, right] = customRange;
    const normalizedStart = toCalendarDate(compareCalendarDate(left, right) <= 0 ? left : right);
    const normalizedEnd = toCalendarDate(compareCalendarDate(left, right) <= 0 ? right : left);
    const dayCount = differenceInCalendarDays(normalizedEnd, normalizedStart) + 1;
    if (dayCount === 1) {
        const dateValue = toDateString(normalizedStart);
        return {
            customWindowError: null,
            input: {
                reportPeriod: 'DAY',
                dataStartDate: dateValue,
                dataEndDate: dateValue,
            },
        };
    }

    if (dayCount === 7 && normalizedStart.getDay() === 0 && normalizedEnd.getDay() === 6) {
        return {
            customWindowError: null,
            input: {
                reportPeriod: 'WEEK',
                dataStartDate: toDateString(normalizedStart),
                dataEndDate: toDateString(normalizedEnd),
            },
        };
    }

    return {
        customWindowError: INVALID_CUSTOM_WINDOW_ERROR,
        input: null,
    };
};

const compareCalendarDate = (left: Date, right: Date) => {
    return left.getFullYear() - right.getFullYear() ||
        left.getMonth() - right.getMonth() ||
        left.getDate() - right.getDate();
};

const toCalendarDate = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const toDateString = (date: Date) => format(date, 'yyyy-MM-dd');
