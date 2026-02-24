import type { ChartPoint } from "../hooks/use-product-history";

const DISPLAY_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_FULL_CHART_POINTS = 320;
export const MAX_COMPACT_CHART_POINTS = 180;

export const CHART_VIEWBOX_WIDTH = 1000;
export const CHART_VIEWBOX_HEIGHT = 360;
export const CHART_PADDING = { left: 72, right: 18, top: 16, bottom: 42 };
export const CHART_INNER_WIDTH =
	CHART_VIEWBOX_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
export const CHART_INNER_HEIGHT =
	CHART_VIEWBOX_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

export interface TimeDomain {
	startAt: number;
	endAt: number;
}

export interface ChartGeometry {
	areaPath: string;
	linePath: string;
	lastX: number;
	lastY: number;
	tMax: number;
	tMin: number;
	vMax: number;
	vMin: number;
}

export const getDisplayTimeDomain = (): TimeDomain => {
	const endAt = Date.now();
	return {
		startAt: endAt - DISPLAY_WINDOW_DAYS * DAY_MS,
		endAt,
	};
};

export const buildDisplayPoints = (
	points: ChartPoint[],
	timeDomain: TimeDomain
): ChartPoint[] => {
	if (points.length === 0) {
		return [];
	}

	const rangeStartTimestamp = Math.min(timeDomain.startAt, timeDomain.endAt);
	const rangeEndTimestamp = Math.max(timeDomain.startAt, timeDomain.endAt);
	const pointsBeforeOrWithinRange = points.filter(
		(point) => point.timestamp <= rangeEndTimestamp
	);
	if (pointsBeforeOrWithinRange.length === 0) {
		return [];
	}

	const lastPointBeforeRangeStart = pointsBeforeOrWithinRange
		.filter((point) => point.timestamp < rangeStartTimestamp)
		.at(-1);
	const pointsWithinRange = pointsBeforeOrWithinRange.filter(
		(point) => point.timestamp >= rangeStartTimestamp
	);

	const displayPoints: ChartPoint[] = [];
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

export const downsamplePoints = (
	points: ChartPoint[],
	maxPoints: number
): ChartPoint[] => {
	if (points.length <= maxPoints) {
		return points;
	}

	const step = Math.max(1, Math.floor(points.length / maxPoints));
	const sampled: ChartPoint[] = [];

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

export const buildChartGeometry = ({
	points,
	timeDomain,
	valueDomain,
}: {
	points: ChartPoint[];
	timeDomain: TimeDomain;
	valueDomain: [number, number];
}): ChartGeometry | null => {
	const firstPoint = points[0];
	const lastPoint = points.at(-1);
	if (!(firstPoint && lastPoint)) {
		return null;
	}

	const tMin = Math.min(timeDomain.startAt, timeDomain.endAt);
	const tMax = Math.max(timeDomain.startAt, timeDomain.endAt);
	const [vMin, vMax] = valueDomain;
	const timeRange = Math.max(1, tMax - tMin);
	const valueRange = Math.max(1, vMax - vMin);

	const toX = (timestamp: number) =>
		CHART_PADDING.left + ((timestamp - tMin) / timeRange) * CHART_INNER_WIDTH;
	const toY = (value: number) =>
		CHART_PADDING.top + ((vMax - value) / valueRange) * CHART_INNER_HEIGHT;

	const segments = [`M ${toX(firstPoint.timestamp)} ${toY(firstPoint.value)}`];
	for (let index = 1; index < points.length; index++) {
		const previousPoint = points[index - 1];
		const currentPoint = points[index];
		if (!(previousPoint && currentPoint)) {
			continue;
		}

		const currentX = toX(currentPoint.timestamp);
		segments.push(`L ${currentX} ${toY(previousPoint.value)}`);
		segments.push(`L ${currentX} ${toY(currentPoint.value)}`);
	}

	const linePath = segments.join(" ");
	const firstX = toX(firstPoint.timestamp);
	const lastX = toX(lastPoint.timestamp);
	const lastY = toY(lastPoint.value);
	const baseLineY = toY(vMin);
	const areaPath = `${linePath} L ${lastX} ${baseLineY} L ${firstX} ${baseLineY} Z`;

	return {
		areaPath,
		lastX,
		lastY,
		linePath,
		tMax,
		tMin,
		vMax,
		vMin,
	};
};

export const projectTimestampX = (
	timestamp: number,
	geometry: ChartGeometry
) => {
	const timeRange = Math.max(1, geometry.tMax - geometry.tMin);
	return (
		CHART_PADDING.left +
		((timestamp - geometry.tMin) / timeRange) * CHART_INNER_WIDTH
	);
};

export const projectValueY = (value: number, geometry: ChartGeometry) => {
	const valueRange = Math.max(1, geometry.vMax - geometry.vMin);
	return (
		CHART_PADDING.top +
		((geometry.vMax - value) / valueRange) * CHART_INNER_HEIGHT
	);
};

export const findNearestPoint = (
	points: ChartPoint[],
	targetTimestamp: number
): ChartPoint | null => {
	const firstPoint = points[0];
	if (!firstPoint) {
		return null;
	}

	let nearestPoint = firstPoint;
	let nearestDistance = Math.abs(firstPoint.timestamp - targetTimestamp);
	for (let index = 1; index < points.length; index++) {
		const point = points[index];
		if (!point) {
			continue;
		}

		const distance = Math.abs(point.timestamp - targetTimestamp);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestPoint = point;
		}
	}

	return nearestPoint;
};

const dedupePointsByTimestamp = (points: ChartPoint[]) => {
	const deduped = new Map<number, ChartPoint>();
	for (const point of points) {
		deduped.set(point.timestamp, point);
	}

	return Array.from(deduped.values()).sort(
		(left, right) => left.timestamp - right.timestamp
	);
};
