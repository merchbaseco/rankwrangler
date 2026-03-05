import type { TopSearchTermTrendPoint } from '@/db/top-search-terms/trends.js';

export type SearchTermsTrendDelta = {
    rankDelta: number | null;
    clickShareDelta: number | null;
    conversionShareDelta: number | null;
};

export type SearchTermsTrendDeltas = {
    d1: SearchTermsTrendDelta;
    d7: SearchTermsTrendDelta;
    d30: SearchTermsTrendDelta;
};

export const calculateSearchTermsTrendDeltas = (
    points: TopSearchTermTrendPoint[]
): SearchTermsTrendDeltas => {
    const latestPoint = points.at(-1);
    if (!latestPoint) {
        return {
            d1: emptyDelta(),
            d7: emptyDelta(),
            d30: emptyDelta(),
        };
    }

    return {
        d1: toDelta(latestPoint, findPointOnOrBefore(points, subtractDays(latestPoint.observedDate, 1))),
        d7: toDelta(latestPoint, findPointOnOrBefore(points, subtractDays(latestPoint.observedDate, 7))),
        d30: toDelta(latestPoint, findPointOnOrBefore(points, subtractDays(latestPoint.observedDate, 30))),
    };
};

export const getTrendStartDate = ({
    latestObservedDate,
    days,
}: {
    latestObservedDate: string;
    days: number;
}) => {
    const normalizedDays = clampTrendRangeDays(days);
    return subtractDays(latestObservedDate, normalizedDays - 1);
};

const findPointOnOrBefore = (points: TopSearchTermTrendPoint[], targetDate: string) => {
    for (let index = points.length - 1; index >= 0; index -= 1) {
        const point = points[index];
        if (point.observedDate <= targetDate) {
            return point;
        }
    }

    return null;
};

const toDelta = (latest: TopSearchTermTrendPoint, previous: TopSearchTermTrendPoint | null) => {
    if (!previous) {
        return emptyDelta();
    }

    return {
        rankDelta: previous.searchFrequencyRank - latest.searchFrequencyRank,
        clickShareDelta: round4(latest.clickShareTop3Sum - previous.clickShareTop3Sum),
        conversionShareDelta: round4(latest.conversionShareTop3Sum - previous.conversionShareTop3Sum),
    };
};

const emptyDelta = (): SearchTermsTrendDelta => ({
    rankDelta: null,
    clickShareDelta: null,
    conversionShareDelta: null,
});

const round4 = (value: number) => Number(value.toFixed(4));

export const clampTrendRangeDays = (days: number) => {
    if (!Number.isFinite(days)) {
        return 90;
    }

    return Math.min(365, Math.max(7, Math.floor(days)));
};

const subtractDays = (dateString: string, days: number) => {
    const value = new Date(`${dateString}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() - days);
    return value.toISOString().split('T')[0];
};
