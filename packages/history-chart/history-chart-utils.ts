import {
    buildEvenYAxisScale,
    buildXAxisFormatter,
    buildXAxisTicks,
    formatDateShort,
    type EvenYAxisScale,
} from './history-chart-axis';
import {
    AMAZON_US_TIME_ZONE,
    HISTORY_RANGE_PRESETS,
    type HistoryChartPoint,
    type HistoryChartRawPoint,
    type HistoryChartTimeDomain,
    type HistoryRangePresetKey,
} from './history-chart-types';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

const fmtMonthDayYear = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: AMAZON_US_TIME_ZONE,
});

export const MAX_CHART_POINTS = 320;
export const MAX_COMPACT_CHART_POINTS = 180;

export type HistoryChartState = {
    displayPoints: HistoryChartPoint[];
    sampledPoints: HistoryChartPoint[];
    hasData: boolean;
    latestPoint: HistoryChartPoint | null;
    firstPoint: HistoryChartPoint | null;
    rangeStartTimestamp: number | null;
    rangeEndTimestamp: number | null;
    xDomain: [number, number] | null;
    xTicks: number[] | undefined;
    xTickFormatter: (timestamp: number) => string;
    yScale: EvenYAxisScale;
};

export const buildHistoryChartState = ({
    points,
    timeDomain,
    maxPoints = MAX_CHART_POINTS,
    yTickCount = 5,
    yMin = 0,
}: {
    points: HistoryChartPoint[];
    timeDomain?: HistoryChartTimeDomain | null;
    maxPoints?: number;
    yTickCount?: number;
    yMin?: number;
}): HistoryChartState => {
    const displayPoints = timeDomain ? buildDisplayPoints(points, timeDomain) : points;
    const sampledPoints = downsamplePoints(displayPoints, maxPoints);
    const latestPoint = sampledPoints.at(-1) ?? null;
    const firstPoint = sampledPoints[0] ?? null;
    const rangeStartTimestamp = timeDomain?.startAt ?? firstPoint?.timestamp ?? null;
    const rangeEndTimestamp = timeDomain?.endAt ?? latestPoint?.timestamp ?? null;
    const xDomain = buildChartTimestampDomain(rangeStartTimestamp, rangeEndTimestamp);
    const yScale = buildEvenYAxisScale(
        sampledPoints.map((point) => point.value),
        { min: yMin, tickCount: yTickCount },
    );

    return {
        displayPoints,
        sampledPoints,
        hasData: sampledPoints.length > 0,
        latestPoint,
        firstPoint,
        rangeStartTimestamp,
        rangeEndTimestamp,
        xDomain,
        xTicks: xDomain ? buildXAxisTicks(xDomain[0], xDomain[1]) : undefined,
        xTickFormatter: xDomain
            ? buildXAxisFormatter(xDomain[0], xDomain[1])
            : formatDateShort,
        yScale,
    };
};

export const resolveTimeDomainForPreset = (
    rangeKey: HistoryRangePresetKey,
    referenceTimeMs = Date.now(),
): HistoryChartTimeDomain | null => {
    const selectedRange = HISTORY_RANGE_PRESETS.find((range) => range.key === rangeKey);
    if (!selectedRange?.days) {
        return null;
    }

    return {
        startAt: referenceTimeMs - selectedRange.days * DAY_IN_MS,
        endAt: referenceTimeMs,
    };
};

export const normalizeHistoryPoints = (
    points: HistoryChartRawPoint[],
): HistoryChartPoint[] =>
    points
        .filter(
            (point) =>
                !point.isMissing &&
                typeof point.value === 'number' &&
                Number.isFinite(point.value),
        )
        .map((point) => ({
            timestamp: Date.parse(point.observedAt),
            value: point.value as number,
        }))
        .filter((point) => Number.isFinite(point.timestamp))
        .sort((left, right) => left.timestamp - right.timestamp);

export const buildDisplayPoints = (
    points: HistoryChartPoint[],
    timeDomain: HistoryChartTimeDomain,
): HistoryChartPoint[] => {
    if (points.length === 0) {
        return [];
    }

    const rangeStartTimestamp = Math.min(timeDomain.startAt, timeDomain.endAt);
    const rangeEndTimestamp = Math.max(timeDomain.startAt, timeDomain.endAt);
    const pointsBeforeOrWithinRange = points.filter((point) => point.timestamp <= rangeEndTimestamp);
    if (pointsBeforeOrWithinRange.length === 0) {
        return [];
    }

    const lastPointBeforeRangeStart = pointsBeforeOrWithinRange
        .filter((point) => point.timestamp < rangeStartTimestamp)
        .at(-1);
    const pointsWithinRange = pointsBeforeOrWithinRange.filter(
        (point) => point.timestamp >= rangeStartTimestamp,
    );

    const displayPoints: HistoryChartPoint[] = [];
    if (lastPointBeforeRangeStart) {
        displayPoints.push({
            timestamp: rangeStartTimestamp,
            value: lastPointBeforeRangeStart.value,
        });
    }

    displayPoints.push(...pointsWithinRange);
    if (displayPoints.length === 0) {
        return [];
    }

    const latestDisplayPoint = displayPoints.at(-1);
    if (latestDisplayPoint && latestDisplayPoint.timestamp < rangeEndTimestamp) {
        displayPoints.push({
            timestamp: rangeEndTimestamp,
            value: latestDisplayPoint.value,
        });
    }

    return dedupePointsByTimestamp(displayPoints);
};

export const downsamplePoints = (points: HistoryChartPoint[], maxPoints: number): HistoryChartPoint[] => {
    if (points.length <= maxPoints) {
        return points;
    }

    const step = Math.max(1, Math.floor(points.length / maxPoints));
    const sampled: HistoryChartPoint[] = [];

    for (let index = 0; index < points.length; index += step) {
        const point = points[index];
        if (point) {
            sampled.push(point);
        }
    }

    const lastPoint = points.at(-1);
    if (lastPoint && sampled.at(-1)?.timestamp !== lastPoint.timestamp) {
        sampled.push(lastPoint);
    }

    return sampled;
};

export const formatDateTooltip = (timestamp: number) => fmtMonthDayYear.format(new Date(timestamp));

export const formatRankValue = (value: number) => `#${value.toLocaleString()}`;

export const formatRankAxisValue = (value: number) => {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(0)}k`;
    }

    return String(Math.round(value));
};

const buildChartTimestampDomain = (
    rangeStartTimestamp: number | null,
    rangeEndTimestamp: number | null,
): [number, number] | null => {
    if (rangeStartTimestamp === null || rangeEndTimestamp === null) {
        return null;
    }

    const min = Math.min(rangeStartTimestamp, rangeEndTimestamp);
    const max = Math.max(rangeStartTimestamp, rangeEndTimestamp);
    if (min === max) {
        return [min - ONE_DAY_IN_MS, max + ONE_DAY_IN_MS];
    }

    return [min, max];
};

const dedupePointsByTimestamp = (points: HistoryChartPoint[]) => {
    const deduped = new Map<number, HistoryChartPoint>();
    for (const point of points) {
        deduped.set(point.timestamp, point);
    }

    return Array.from(deduped.values()).sort((left, right) => left.timestamp - right.timestamp);
};
