import type { ChartPoint } from "../hooks/use-product-history";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const CHART_PADDING = { top: 8, right: 8, bottom: 20, left: 8 };

const COMPACT_MAX_POINTS = 90;
const FULL_MAX_POINTS = 180;
const DISPLAY_WINDOW_DAYS = 90;
const DISPLAY_WINDOW_MS = DISPLAY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const ProductHistoryChart = ({
	chartId,
	collecting,
	compact = false,
	error,
	isLoading,
	points,
	showHeader = true,
}: {
	chartId: string;
	collecting: boolean;
	compact?: boolean;
	error: string | null;
	isLoading: boolean;
	points: ChartPoint[];
	showHeader?: boolean;
}) => {
	const topMarginClass = showHeader ? "mt-2 " : "";

	if (isLoading) {
		return (
			<div
				className={`${topMarginClass}h-20 animate-pulse rounded-md border border-gray-200 bg-gray-100`}
			/>
		);
	}

	if (error) {
		return (
			<div
				className={`${topMarginClass}rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-red-700 text-xs`}
			>
				{error}
			</div>
		);
	}

	if (collecting) {
		return (
			<div
				className={`${topMarginClass}rounded-md border border-gray-200 bg-white px-3 py-2.5`}
			>
				<div className="flex items-center gap-2">
					<svg
						className="h-3.5 w-3.5 animate-spin text-gray-400"
						fill="none"
						viewBox="0 0 24 24"
					>
						<title>Loading</title>
						<circle
							className="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							strokeWidth="4"
						/>
						<path
							className="opacity-75"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							fill="currentColor"
						/>
					</svg>
					<span className="text-gray-500 text-xs">Loading BSR history…</span>
				</div>
			</div>
		);
	}

	if (points.length === 0) {
		return (
			<div
				className={`${topMarginClass}rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5`}
			>
				<span className="font-medium text-gray-700 text-xs">
					No BSR history available.
				</span>
			</div>
		);
	}

	const timeDomain = getDisplayTimeDomain();
	const visiblePoints = points.filter(
		(point) =>
			point.timestamp >= timeDomain.startAt &&
			point.timestamp <= timeDomain.endAt
	);
	if (visiblePoints.length === 0) {
		return (
			<div
				className={`${topMarginClass}rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5`}
			>
				<span className="font-medium text-gray-700 text-xs">
					No BSR history in the last 90 days.
				</span>
			</div>
		);
	}

	const sampledPoints = downsamplePoints(
		visiblePoints,
		compact ? COMPACT_MAX_POINTS : FULL_MAX_POINTS
	);
	const geometry = buildGeometry(sampledPoints, timeDomain);
	if (!geometry) {
		return null;
	}

	const latestPoint = sampledPoints.at(-1);

	return (
		<div
			className={`${topMarginClass}rounded-md border border-gray-200 bg-white p-2`}
		>
			{showHeader ? (
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
			) : null}

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
				<span>{formatShortDate(timeDomain.startAt)}</span>
				<span>{formatShortDate(timeDomain.endAt)}</span>
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

const buildGeometry = (
	points: ChartPoint[],
	timeDomain: { startAt: number; endAt: number }
) => {
	if (points.length === 0) {
		return null;
	}

	const values = points.map((point) => point.value);
	const minTimestamp = timeDomain.startAt;
	const maxTimestamp = timeDomain.endAt;
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

const getDisplayTimeDomain = () => {
	const endAt = Date.now();
	return {
		startAt: endAt - DISPLAY_WINDOW_MS,
		endAt,
	};
};
