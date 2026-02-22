import type { HistoryPoint } from '@/components/dashboard/product-history-panel/types';
import type { HistoryTimeDomain } from '@/components/dashboard/product-history-panel/types';

export const MAX_CHART_POINTS = 320;

export const VB_W = 1000;
export const VB_H = 340;
export const PAD = { l: 80, r: 16, t: 16, b: 40 };
export const INNER_W = VB_W - PAD.l - PAD.r;
export const INNER_H = VB_H - PAD.t - PAD.b;

const Y_TICK_COUNT = 5;
const X_TICK_COUNT = 5;

export const SYNC_VB_W = 400;
export const SYNC_VB_H = 120;
export const SYNC_PAD = { l: 0, r: 0, t: 8, b: 8 };
const SYNC_INNER_W = SYNC_VB_W - SYNC_PAD.l - SYNC_PAD.r;
export const SYNC_INNER_H = SYNC_VB_H - SYNC_PAD.t - SYNC_PAD.b;

type ChartGeometry = {
	linePath: string;
	areaPath: string;
	lastX: number;
	lastY: number;
	tMin: number;
	tMax: number;
	vMin: number;
	vMax: number;
	yTicks: { y: number; value: number }[];
	xTicks: { x: number; ts: number }[];
};

export const downsamplePoints = (points: HistoryPoint[], max: number) => {
	if (points.length <= max) {
		return points;
	}

	const step = Math.max(1, Math.floor(points.length / max));
	const output: HistoryPoint[] = [];

	for (let index = 0; index < points.length; index += step) {
		const point = points[index];
		if (point) {
			output.push(point);
		}
	}

	const lastPoint = points.at(-1);
	if (lastPoint && output.at(-1)?.timestamp !== lastPoint.timestamp) {
		output.push(lastPoint);
	}

	return output;
};

export const buildChartGeometry = (
	points: HistoryPoint[],
	timeDomain?: HistoryTimeDomain | null,
): ChartGeometry | null => {
	if (points.length === 0) {
		return null;
	}

	const timestamps = points.map((point) => point.timestamp);
	const values = points.map((point) => point.value);
	let tMin = Math.min(...timestamps);
	let tMax = Math.max(...timestamps);
	const rawMin = Math.min(...values);
	const rawMax = Math.max(...values);

	if (timeDomain) {
		const domainStart = Math.min(timeDomain.startAt, timeDomain.endAt);
		const domainEnd = Math.max(timeDomain.startAt, timeDomain.endAt);
		tMin = Math.min(tMin, domainStart);
		tMax = Math.max(tMax, domainEnd);
	}

	const rawRange = Math.max(1, rawMax - rawMin);
	const valuePadding = rawRange * 0.05;
	const vMin = Math.max(0, rawMin - valuePadding);
	const vMax = rawMax + valuePadding;

	const timeRange = Math.max(1, tMax - tMin);
	const valueRange = Math.max(1, vMax - vMin);
	const toX = (timestamp: number) => PAD.l + ((timestamp - tMin) / timeRange) * INNER_W;
	const toY = (value: number) => PAD.t + ((vMax - value) / valueRange) * INNER_H;

	const linePath = points
		.map((point, index) =>
			`${index === 0 ? 'M' : 'L'} ${toX(point.timestamp)} ${toY(point.value)}`,
		)
		.join(' ');

	const firstPoint = points[0];
	const lastPoint = points.at(-1);
	if (!firstPoint || !lastPoint) {
		return null;
	}

	const baseY = PAD.t + INNER_H;
	const lastX = toX(lastPoint.timestamp);
	const lastY = toY(lastPoint.value);
	const areaPath = `${linePath} L ${lastX} ${baseY} L ${toX(firstPoint.timestamp)} ${baseY} Z`;

	const yTicks = Array.from({ length: Y_TICK_COUNT }, (_, index) => {
		const fraction = index / (Y_TICK_COUNT - 1);
		return {
			y: PAD.t + fraction * INNER_H,
			value: Math.round(vMax - fraction * (vMax - vMin)),
		};
	});

	const xTicks = Array.from({ length: X_TICK_COUNT }, (_, index) => {
		const fraction = index / (X_TICK_COUNT - 1);
		return {
			x: PAD.l + fraction * INNER_W,
			ts: tMin + fraction * timeRange,
		};
	});

	return {
		linePath,
		areaPath,
		lastX,
		lastY,
		tMin,
		tMax,
		vMin,
		vMax,
		yTicks,
		xTicks,
	};
};

export const formatValue = (metric: string, value: number) => {
	if (isPriceMetric(metric)) {
		return `$${(value / 100).toFixed(2)}`;
	}
	return `#${value.toLocaleString()}`;
};

export const formatAxisValue = (metric: string, value: number) => {
	if (isPriceMetric(metric)) {
		const dollars = value / 100;
		return dollars >= 1000 ? `$${(dollars / 1000).toFixed(1)}k` : `$${dollars.toFixed(0)}`;
	}

	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(0)}k`;
	}
	return String(value);
};

export const formatDateAxis = (timestamp: number) =>
	new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
		new Date(timestamp),
	);

export const formatDateShort = (timestamp: number) =>
	new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' }).format(
		new Date(timestamp),
	);

export const buildSyncWavePath = () => {
	const pointCount = 60;
	const coordinates: string[] = [];

	for (let index = 0; index <= pointCount; index += 1) {
		const fraction = index / pointCount;
		const x = SYNC_PAD.l + fraction * SYNC_INNER_W;
		const y =
			SYNC_PAD.t +
			SYNC_INNER_H / 2 +
			Math.sin(fraction * Math.PI * 3.5) * (SYNC_INNER_H * 0.35) +
			Math.sin(fraction * Math.PI * 7) * (SYNC_INNER_H * 0.08);
		coordinates.push(`${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
	}

	return coordinates.join(' ');
};

const isPriceMetric = (metric: string) =>
	metric === 'priceAmazon' || metric === 'priceNew' || metric === 'priceNewFba';
