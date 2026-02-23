import {
	buildChartGeometry,
	INNER_H,
	INNER_W,
	MAX_CHART_POINTS,
	PAD,
	VB_H,
	VB_W,
	downsamplePoints,
} from '@/components/dashboard/product-history-panel/chart-utils';
import type {
	HistoryPoint,
	HistoryQueryResult,
	HistoryTimeDomain,
} from '@/components/dashboard/product-history-panel/types';

export const buildPoints = ({
	query,
	timeDomain,
}: {
	query: HistoryQueryResult;
	timeDomain?: HistoryTimeDomain | null;
}): HistoryPoint[] => {
	if (!query.data) {
		return [];
	}

	const points = query.data.points
		.filter((point) => !point.isMissing && typeof point.value === 'number' && Number.isFinite(point.value))
		.map((point) => ({ timestamp: Date.parse(point.observedAt), value: point.value as number }))
		.filter((point) => Number.isFinite(point.timestamp))
		.sort((left, right) => left.timestamp - right.timestamp);

	if (!timeDomain || points.length === 0) {
		return points;
	}

	return buildEventDisplayPoints(points, timeDomain);
};

export const buildChartState = (points: HistoryPoint[], timeDomain?: HistoryTimeDomain | null) => {
	const sampledPoints = downsamplePoints(points, MAX_CHART_POINTS);
	return {
		sampledPoints,
		chartGeometry: buildChartGeometry(sampledPoints, timeDomain),
	};
};

export const getHoverPosition = ({
	chartGeometry,
	hoverPoint,
}: {
	chartGeometry: ReturnType<typeof buildChartGeometry>;
	hoverPoint: HistoryPoint | null;
}) => {
	if (!chartGeometry || !hoverPoint) {
		return { flip: false, leftPercent: 0, topPercent: 0, x: null, y: null };
	}

	const x =
		PAD.l +
		((hoverPoint.timestamp - chartGeometry.tMin) /
			Math.max(1, chartGeometry.tMax - chartGeometry.tMin)) *
			INNER_W;
	const y =
		PAD.t +
		((chartGeometry.vMax - hoverPoint.value) /
			Math.max(1, chartGeometry.vMax - chartGeometry.vMin)) *
			INNER_H;

	return {
		flip: (x / VB_W) * 100 > 65,
		leftPercent: (x / VB_W) * 100,
		topPercent: (y / VB_H) * 100,
		x,
		y,
	};
};

const buildEventDisplayPoints = (
	points: HistoryPoint[],
	timeDomain: HistoryTimeDomain,
): HistoryPoint[] => {
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

	const displayPoints: HistoryPoint[] = [];
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

const dedupePointsByTimestamp = (points: HistoryPoint[]) => {
	const deduped = new Map<number, HistoryPoint>();
	for (const point of points) {
		deduped.set(point.timestamp, point);
	}

	return Array.from(deduped.values()).sort((left, right) => left.timestamp - right.timestamp);
};
