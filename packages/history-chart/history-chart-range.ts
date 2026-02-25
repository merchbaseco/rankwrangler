import { useCallback, useMemo, useRef, useState } from 'react';
import { resolveTimeDomainForPreset } from './history-chart-utils';
import {
    AMAZON_US_TIME_ZONE,
    type HistoryChartTimeDomain,
    type HistoryRangePresetKey,
} from './history-chart-types';

export { AMAZON_US_TIME_ZONE };

export type HistoryRangeSelectionKey = HistoryRangePresetKey | 'custom';
export type HistoryCustomRange = [Date, Date] | null;
export type HistoryPickerRange = { from: Date | undefined; to?: Date | undefined } | undefined;
export type HistoryQueryRange = { startAt?: string; endAt?: string };

export const useHistoryRangeSelection = ({
    defaultRange = '90d',
    referenceTimeMs,
    customRangeTimeZone = AMAZON_US_TIME_ZONE,
}: {
    defaultRange?: HistoryRangePresetKey;
    referenceTimeMs?: number;
    customRangeTimeZone?: string;
}) => {
    const referenceTimeRef = useRef(referenceTimeMs ?? Date.now());
    const [activeRange, setActiveRange] = useState<HistoryRangeSelectionKey>(defaultRange);
    const [customRange, setCustomRange] = useState<HistoryCustomRange>(null);
    const [datePickerRange, setDatePickerRange] = useState<HistoryPickerRange>();

    const handlePresetClick = useCallback((key: HistoryRangePresetKey) => {
        setActiveRange(key);
        setCustomRange(null);
        setDatePickerRange(undefined);
    }, []);

    const handleDateRangeSelect = useCallback(
        (range: HistoryPickerRange) => {
            if (datePickerRange?.from && !datePickerRange.to) {
                setDatePickerRange(range);
                if (range?.from && range?.to) {
                    setCustomRange([range.from, range.to]);
                    setActiveRange('custom');
                }
            }
        },
        [datePickerRange?.from, datePickerRange?.to],
    );

    const handleDayClick = useCallback(
        (date: Date) => {
            if (datePickerRange?.from && !datePickerRange.to) {
                return;
            }

            setDatePickerRange({ from: date });
        },
        [datePickerRange?.from, datePickerRange?.to],
    );

    const chartTimeDomain = useMemo(
        () =>
            resolveTimeDomainForSelection({
                activeRange,
                customRange,
                referenceTimeMs: referenceTimeRef.current,
                customRangeTimeZone,
            }),
        [activeRange, customRange, customRangeTimeZone],
    );

    const queryRange = useMemo(
        () => buildHistoryQueryRange({ activeRange, timeDomain: chartTimeDomain }),
        [activeRange, chartTimeDomain],
    );

    return {
        activeRange,
        customRange,
        datePickerRange,
        chartTimeDomain,
        queryRange,
        handleDayClick,
        handleDateRangeSelect,
        handlePresetClick,
    };
};

export const resolveTimeDomainForSelection = ({
    activeRange,
    customRange,
    referenceTimeMs = Date.now(),
    customRangeTimeZone = AMAZON_US_TIME_ZONE,
}: {
    activeRange: HistoryRangeSelectionKey;
    customRange: HistoryCustomRange;
    referenceTimeMs?: number;
    customRangeTimeZone?: string;
}): HistoryChartTimeDomain | null => {
    if (activeRange === 'custom') {
        return resolveCustomTimeDomain(customRange, customRangeTimeZone);
    }

    return resolveTimeDomainForPreset(activeRange, referenceTimeMs);
};

export const buildHistoryQueryRange = ({
    activeRange,
    timeDomain,
}: {
    activeRange: HistoryRangeSelectionKey;
    timeDomain: HistoryChartTimeDomain | null;
}): HistoryQueryRange => {
    if (!timeDomain) {
        return {};
    }

    if (activeRange === 'custom') {
        return {
            startAt: new Date(timeDomain.startAt).toISOString(),
            endAt: new Date(timeDomain.endAt).toISOString(),
        };
    }

    return {
        startAt: new Date(timeDomain.startAt).toISOString(),
    };
};

export const resolveCustomTimeDomain = (
    customRange: HistoryCustomRange,
    timeZone = AMAZON_US_TIME_ZONE,
): HistoryChartTimeDomain | null => {
    if (!customRange) {
        return null;
    }

    const [left, right] = customRange;
    if (!isValidDate(left) || !isValidDate(right)) {
        return null;
    }

    const leftParts = toCalendarDateParts(left);
    const rightParts = toCalendarDateParts(right);
    const [startParts, endParts] =
        compareDateParts(leftParts, rightParts) <= 0
            ? [leftParts, rightParts]
            : [rightParts, leftParts];

    const startAt = resolveUtcTimestampForZone({
        ...startParts,
        hour: 0,
        minute: 0,
        second: 0,
    }, timeZone);
    const endExclusive = resolveUtcTimestampForZone({
        ...addCalendarDays(endParts, 1),
        hour: 0,
        minute: 0,
        second: 0,
    }, timeZone);

    return {
        startAt,
        endAt: endExclusive - 1,
    };
};

type CalendarDateParts = {
    year: number;
    month: number;
    day: number;
};

type CalendarDateTimeParts = CalendarDateParts & {
    hour: number;
    minute: number;
    second: number;
};

const resolveUtcTimestampForZone = (
    parts: CalendarDateTimeParts,
    timeZone: string,
) => {
    const utcGuess = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
        0,
    );
    const firstOffset = resolveTimeZoneOffsetMs(utcGuess, timeZone);
    const firstPass = utcGuess - firstOffset;
    const secondOffset = resolveTimeZoneOffsetMs(firstPass, timeZone);

    return secondOffset === firstOffset ? firstPass : utcGuess - secondOffset;
};

const resolveTimeZoneOffsetMs = (timestamp: number, timeZone: string) => {
    const zonedParts = getZonedDateTimeParts(timestamp, timeZone);
    const zonedAsUtc = Date.UTC(
        zonedParts.year,
        zonedParts.month - 1,
        zonedParts.day,
        zonedParts.hour,
        zonedParts.minute,
        zonedParts.second,
        0,
    );

    return zonedAsUtc - timestamp;
};

const getZonedDateTimeParts = (timestamp: number, timeZone: string) => {
    const formatter = getDateTimeFormatter(timeZone);
    const byType = new Map(
        formatter
            .formatToParts(new Date(timestamp))
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value]),
    );

    return {
        year: Number(byType.get('year')),
        month: Number(byType.get('month')),
        day: Number(byType.get('day')),
        hour: Number(byType.get('hour')),
        minute: Number(byType.get('minute')),
        second: Number(byType.get('second')),
    };
};

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const getDateTimeFormatter = (timeZone: string) => {
    const cached = dateTimeFormatterCache.get(timeZone);
    if (cached) {
        return cached;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    dateTimeFormatterCache.set(timeZone, formatter);

    return formatter;
};

const toCalendarDateParts = (date: Date): CalendarDateParts => ({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
});

const addCalendarDays = (parts: CalendarDateParts, days: number): CalendarDateParts => {
    const shiftedDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return {
        year: shiftedDate.getUTCFullYear(),
        month: shiftedDate.getUTCMonth() + 1,
        day: shiftedDate.getUTCDate(),
    };
};

const compareDateParts = (left: CalendarDateParts, right: CalendarDateParts) =>
    left.year - right.year || left.month - right.month || left.day - right.day;

const isValidDate = (date: Date) => Number.isFinite(date.getTime());
