import type { ChartPoint } from "../hooks/use-product-history";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PADDING = { top: 8, right: 8, bottom: 20, left: 8 };

const COMPACT_MAX_POINTS = 90;
const FULL_MAX_POINTS = 180;

export const ProductHistoryChart = ({
	chartId,
	collecting,
	compact = false,
	error,
	isLoading,
	points,
}: {
	chartId: string;
	collecting: boolean;
	compact?: boolean;
	error: string | null;
	isLoading: boolean;
	points: ChartPoint[];
}) => {
	if (isLoading) {
		return (
			<div className="mt-2 h-20 animate-pulse rounded-md border border-gray-200 bg-gray-100" />
		);
	}

	if (error) {
		return (
			<div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-red-700 text-xs">
				{error}
			</div>
		);
	}

	if (collecting || points.length === 0) {
		return (
			<div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2">
				<div className="flex items-center gap-2">
					<div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
					<span className="font-medium text-amber-800 text-xs">
						Collecting history...
					</span>
				</div>
				<p className="mt-1 text-[11px] text-amber-700">
					Keepa sync is running. This updates every 5 seconds.
				</p>
			</div>
		);
	}

	const sampledPoints = downsamplePoints(
		points,
		compact ? COMPACT_MAX_POINTS : FULL_MAX_POINTS
	);
	const geometry = buildGeometry(sampledPoints);
	if (!geometry) {
		return null;
	}

	const latestPoint = sampledPoints.at(-1);
	const oldestPoint = sampledPoints[0];

	return (
		<div className="mt-2 rounded-md border border-gray-200 bg-white p-2">
			<div className="mb-1 flex items-center justify-between gap-2">
				<span className="font-medium text-[11px] text-gray-700">
					BSR History
				</span>
				{latestPoint ? (
					<span className="font-semibold text-[11px] text-gray-900">
						#{latestPoint.value.toLocaleString()}
					</span>
				) : null}
			</div>

			<svg
				className="block w-full"
				style={{ aspectRatio: `${CHART_WIDTH}/${CHART_HEIGHT}` }}
				viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
			>
				<title>BSR history chart</title>
				<defs>
					<linearGradient id={chartId} x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stopColor="rgb(95 135 135)" stopOpacity="0.22" />
						<stop
							offset="100%"
							stopColor="rgb(95 135 135)"
							stopOpacity="0.02"
						/>
					</linearGradient>
				</defs>

				<line
					stroke="rgb(229 231 235)"
					strokeWidth="1"
					x1={CHART_PADDING.left}
					x2={CHART_WIDTH - CHART_PADDING.right}
					y1={CHART_HEIGHT - CHART_PADDING.bottom}
					y2={CHART_HEIGHT - CHART_PADDING.bottom}
				/>

				<path d={geometry.areaPath} fill={`url(#${chartId})`} />
				<path
					d={geometry.linePath}
					fill="none"
					stroke="rgb(95 135 135)"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2"
				/>
				<circle
					cx={geometry.lastX}
					cy={geometry.lastY}
					fill="rgb(95 135 135)"
					r="3"
					stroke="white"
					strokeWidth="2"
				/>
			</svg>

			<div className="mt-1 flex items-center justify-between text-[10px] text-gray-500">
				<span>
					{oldestPoint ? formatShortDate(oldestPoint.timestamp) : "-"}
				</span>
				<span>
					{latestPoint ? formatShortDate(latestPoint.timestamp) : "-"}
				</span>
			</div>
		</div>
	);
};

const downsamplePoints = (
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

const buildGeometry = (points: ChartPoint[]) => {
	if (points.length === 0) {
		return null;
	}

	const timestamps = points.map((point) => point.timestamp);
	const values = points.map((point) => point.value);
	const minTimestamp = Math.min(...timestamps);
	const maxTimestamp = Math.max(...timestamps);
	const minValue = Math.min(...values);
	const maxValue = Math.max(...values);

	const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
	const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
	const valueRange = Math.max(1, maxValue - minValue);
	const timestampRange = Math.max(1, maxTimestamp - minTimestamp);
	const paddedMinValue = Math.max(0, minValue - valueRange * 0.1);
	const paddedMaxValue = maxValue + valueRange * 0.1;
	const paddedRange = Math.max(1, paddedMaxValue - paddedMinValue);

	const toX = (timestamp: number) =>
		CHART_PADDING.left +
		((timestamp - minTimestamp) / timestampRange) * innerWidth;
	const toY = (value: number) =>
		CHART_PADDING.top + ((paddedMaxValue - value) / paddedRange) * innerHeight;

	const linePath = points
		.map((point, index) => {
			return `${index === 0 ? "M" : "L"} ${toX(point.timestamp)} ${toY(point.value)}`;
		})
		.join(" ");

	const firstPoint = points[0];
	const lastPoint = points.at(-1);
	if (!(firstPoint && lastPoint)) {
		return null;
	}

	const baseLineY = CHART_HEIGHT - CHART_PADDING.bottom;
	const lastX = toX(lastPoint.timestamp);
	const lastY = toY(lastPoint.value);
	const areaPath = `${linePath} L ${lastX} ${baseLineY} L ${toX(firstPoint.timestamp)} ${baseLineY} Z`;

	return {
		areaPath,
		lastX,
		lastY,
		linePath,
	};
};

const formatShortDate = (timestamp: number) =>
	new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "2-digit",
	}).format(new Date(timestamp));
