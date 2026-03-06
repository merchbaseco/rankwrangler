import { useCallback, useMemo, useState } from 'react';
import {
    resolveSearchTermsListWindow,
    type SearchTermsCustomRange,
    type SearchTermsPickerRange,
    type SearchTermsWindowSelectionKey,
} from '@/components/dashboard/keywords/search-terms-window';

export const useSearchTermsWindowSelection = () => {
    const [activeWindow, setActiveWindow] =
        useState<SearchTermsWindowSelectionKey>('latest-day');
    const [customRange, setCustomRange] = useState<SearchTermsCustomRange>(null);
    const [datePickerRange, setDatePickerRange] = useState<SearchTermsPickerRange>();
    const [customSelectionError, setCustomSelectionError] = useState<string | null>(null);

    const resolvedWindow = useMemo(
        () => resolveSearchTermsListWindow({ selection: activeWindow, customRange }),
        [activeWindow, customRange],
    );
    const activeWindowInput = resolvedWindow.input ?? { reportPeriod: 'DAY' as const };

    const handlePresetClick = useCallback((preset: 'latest-day' | 'last-complete-week') => {
        setActiveWindow(preset);
        setCustomRange(null);
        setCustomSelectionError(null);
        setDatePickerRange(undefined);
    }, []);

    const handleDayClick = useCallback(
        (date: Date) => {
            if (datePickerRange?.from && !datePickerRange.to) {
                return;
            }

            setCustomSelectionError(null);
            setDatePickerRange({ from: date });
        },
        [datePickerRange?.from, datePickerRange?.to],
    );

    const handleDateRangeSelect = useCallback(
        (range: SearchTermsPickerRange) => {
            if (!(datePickerRange?.from && !datePickerRange.to)) {
                return;
            }

            setDatePickerRange(range);
            if (!range?.from || !range?.to) {
                return;
            }

            const normalizedRange = normalizeDateRange(range.from, range.to);
            const resolved = resolveSearchTermsListWindow({
                selection: 'custom',
                customRange: normalizedRange,
            });

            if (resolved.input) {
                setCustomRange(normalizedRange);
                setActiveWindow('custom');
                setCustomSelectionError(null);
                return;
            }

            setCustomSelectionError(resolved.customWindowError);
        },
        [datePickerRange?.from, datePickerRange?.to],
    );

    return {
        activeWindow,
        activeWindowInput,
        customRange,
        datePickerRange,
        customSelectionError,
        handleDateRangeSelect,
        handleDayClick,
        handlePresetClick,
    };
};

const normalizeDateRange = (left: Date, right: Date): [Date, Date] => {
    if (left.getTime() <= right.getTime()) {
        return [left, right];
    }

    return [right, left];
};
