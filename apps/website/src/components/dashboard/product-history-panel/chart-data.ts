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

export const buildPoints = (query: HistoryQueryResult): HistoryPoint[] => {
	if (!query.data) {
		return [];
	}

	return query.data.points
		.filter((point) => !point.isMissing && typeof point.value === 'number' && Number.isFinite(point.value))
		.map((point) => ({ timestamp: Date.parse(point.observedAt), value: point.value as number }))
		.filter((point) => Number.isFinite(point.timestamp));
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
