import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ChartPoint } from "../hooks/use-product-history";
import { DateRangePresets } from "./date-range-presets";
import { renderChartStateFallback } from "./product-history-chart-fallback";
import { formatChartValue } from "./product-history-chart-formatters";
import { ProductHistoryChartSvg } from "./product-history-chart-svg";
import {
	buildChartGeometry,
	buildDisplayPoints,
	CHART_INNER_WIDTH,
	CHART_PADDING,
	CHART_VIEWBOX_HEIGHT,
	CHART_VIEWBOX_WIDTH,
	downsamplePoints,
	findNearestPoint,
	getDisplayTimeDomain,
	MAX_COMPACT_CHART_POINTS,
	MAX_FULL_CHART_POINTS,
	projectTimestampX,
	projectValueY,
} from "./product-history-chart-utils";
import {
	buildXAxisFormatter,
	buildXAxisTicks,
} from "./product-history-chart-x-axis";
import { buildEvenYAxisScale } from "./product-history-chart-y-axis";

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
	const [hoverPoint, setHoverPoint] = useState<ChartPoint | null>(null);
	const [activeRange, setActiveRange] = useState("90d");
	const svgRef = useRef<SVGSVGElement>(null);

	const timeDomain = useMemo(() => getDisplayTimeDomain(), []);
	const displayPoints = useMemo(
		() => buildDisplayPoints(points, timeDomain),
		[points, timeDomain]
	);
	const sampledPoints = useMemo(
		() =>
			downsamplePoints(
				displayPoints,
				compact ? MAX_COMPACT_CHART_POINTS : MAX_FULL_CHART_POINTS
			),
		[compact, displayPoints]
	);
	const yScale = useMemo(
		() =>
			buildEvenYAxisScale(
				sampledPoints.map((point) => point.value),
				{ min: 0, tickCount: 5 }
			),
		[sampledPoints]
	);
	const chartGeometry = useMemo(
		() =>
			buildChartGeometry({
				points: sampledPoints,
				timeDomain,
				valueDomain: yScale.domain,
			}),
		[sampledPoints, timeDomain, yScale.domain]
	);
	const xTicks = useMemo(
		() => buildXAxisTicks(timeDomain.startAt, timeDomain.endAt),
		[timeDomain]
	);
	const xTickFormatter = useMemo(
		() => buildXAxisFormatter(timeDomain.startAt, timeDomain.endAt),
		[timeDomain]
	);

	const latestPoint = sampledPoints.at(-1) ?? null;
	const hoverProjection =
		hoverPoint == null || !chartGeometry
			? null
			: {
					x: projectTimestampX(hoverPoint.timestamp, chartGeometry),
					y: projectValueY(hoverPoint.value, chartGeometry),
				};
	const tooltipPosition = hoverProjection
		? {
				flip: (hoverProjection.x / CHART_VIEWBOX_WIDTH) * 100 > 65,
				leftPercent: Math.min(
					98,
					Math.max(2, (hoverProjection.x / CHART_VIEWBOX_WIDTH) * 100)
				),
				topPercent: Math.min(
					92,
					Math.max(8, (hoverProjection.y / CHART_VIEWBOX_HEIGHT) * 100)
				),
			}
		: null;

	const handlePointerMove = useCallback(
		(event: ReactPointerEvent<SVGSVGElement>) => {
			if (!chartGeometry || sampledPoints.length === 0 || !svgRef.current) {
				return;
			}

			const rect = svgRef.current.getBoundingClientRect();
			if (rect.width <= 0) {
				return;
			}

			const pointerX =
				((event.clientX - rect.left) / rect.width) * CHART_VIEWBOX_WIDTH;
			const clampedX = Math.max(
				CHART_PADDING.left,
				Math.min(CHART_VIEWBOX_WIDTH - CHART_PADDING.right, pointerX)
			);
			const timeRange = Math.max(1, chartGeometry.tMax - chartGeometry.tMin);
			const targetTimestamp =
				chartGeometry.tMin +
				((clampedX - CHART_PADDING.left) / Math.max(1, CHART_INNER_WIDTH)) *
					timeRange;
			const nearestPoint = findNearestPoint(sampledPoints, targetTimestamp);
			if (!nearestPoint) {
				return;
			}

			setHoverPoint((currentPoint) =>
				currentPoint?.timestamp === nearestPoint.timestamp
					? currentPoint
					: nearestPoint
			);
		},
		[chartGeometry, sampledPoints]
	);

	const chartStateFallback = renderChartStateFallback({
		collecting,
		displayPointCount: displayPoints.length,
		error,
		isLoading,
		pointCount: points.length,
		topMarginClass,
	});
	if (chartStateFallback) {
		return chartStateFallback;
	}

	if (!chartGeometry) {
		return null;
	}

	return (
		<div
			className={`${topMarginClass}rounded-md border border-gray-200 bg-white`}
		>
			{showHeader ? (
				<div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
					<span className="font-medium text-[11px] text-gray-700">
						BSR History
					</span>
					{latestPoint ? (
						<span className="font-semibold text-[12px] text-gray-900">
							{formatChartValue(latestPoint.value)}
						</span>
					) : null}
				</div>
			) : null}
			{compact ? null : (
				<div className="px-3 pb-1">
					<DateRangePresets
						activeRange={activeRange}
						onRangeChange={setActiveRange}
					/>
				</div>
			)}
			<div className="px-3 pb-3">
				<ProductHistoryChartSvg
					chartGeometry={chartGeometry}
					chartId={chartId}
					compact={compact}
					hoverPoint={hoverPoint}
					hoverProjection={hoverProjection}
					latestPoint={latestPoint}
					onPointerLeave={() => setHoverPoint(null)}
					onPointerMove={handlePointerMove}
					svgRef={svgRef}
					tooltipPosition={tooltipPosition}
					xTickFormatter={xTickFormatter}
					xTicks={xTicks}
					yTicks={yScale.ticks}
				/>
			</div>
		</div>
	);
};
