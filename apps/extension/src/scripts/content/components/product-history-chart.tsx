import { HistoryAreaChart } from "@rankwrangler/history-chart/history-area-chart";
import {
	AMAZON_US_TIME_ZONE,
	useHistoryRangeSelection,
} from "@rankwrangler/history-chart/history-chart-range";
import {
	buildHistoryChartState,
	formatDateTooltip,
	formatRankAxisValue,
	formatRankValue,
	MAX_CHART_POINTS,
	MAX_COMPACT_CHART_POINTS,
} from "@rankwrangler/history-chart/history-chart-utils";
import { useMemo } from "react";
import type { ChartPoint } from "../hooks/use-product-history";
import { DateRangePresets } from "./date-range-presets";
import { renderChartStateFallback } from "./product-history-chart-fallback";

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
	const {
		activeRange,
		chartTimeDomain: timeDomain,
		customRange,
		datePickerRange,
		handleDayClick,
		handleDateRangeSelect,
		handlePresetClick: handleRangeChange,
	} = useHistoryRangeSelection({
		defaultRange: "90d",
		customRangeTimeZone: AMAZON_US_TIME_ZONE,
	});
	const chartState = useMemo(
		() =>
			buildHistoryChartState({
				points,
				timeDomain,
				maxPoints: compact ? MAX_COMPACT_CHART_POINTS : MAX_CHART_POINTS,
				yMin: 0,
				yTickCount: 5,
			}),
		[compact, points, timeDomain]
	);

	const chartStateFallback = renderChartStateFallback({
		collecting,
		displayPointCount: chartState.displayPoints.length,
		error,
		isLoading,
		pointCount: points.length,
		topMarginClass,
	});
	if (chartStateFallback) {
		return chartStateFallback;
	}

	const rangeLabel =
		chartState.rangeStartTimestamp !== null &&
		chartState.rangeEndTimestamp !== null
			? `${formatDateTooltip(chartState.rangeStartTimestamp)} \u2013 ${formatDateTooltip(
					chartState.rangeEndTimestamp
				)}`
			: null;

	return (
		<div className={`${topMarginClass}border border-gray-300 bg-white`}>
			{compact ? null : (
				<div className="border-gray-300 border-b px-3 py-1">
					<DateRangePresets
						activeRange={activeRange}
						customRange={customRange}
						datePickerRange={datePickerRange}
						onDateRangeSelect={handleDateRangeSelect}
						onDayClick={handleDayClick}
						onRangeChange={handleRangeChange}
					/>
				</div>
			)}
			{showHeader ? (
				<div className="flex h-11 items-center justify-between border-gray-300 border-b px-4">
					<span className="font-mono font-semibold text-[13px] text-gray-600 tracking-wide">
						RANK
					</span>
					<span className="font-mono text-[13px] text-gray-500">BSR</span>
				</div>
			) : null}
			<div className="flex items-baseline gap-3 px-4 pt-3 pb-1">
				{chartState.latestPoint ? (
					<span className="font-mono font-semibold text-[#3f5f86] text-[44px] leading-none tracking-tight">
						{formatRankValue(chartState.latestPoint.value)}
					</span>
				) : null}
				{rangeLabel ? (
					<span className="font-mono text-[11px] text-gray-500">
						{rangeLabel}
					</span>
				) : null}
			</div>
			<div className="px-3 pb-3">
				<HistoryAreaChart
					axisColor="rgb(107 114 128)"
					axisFontFamily="ui-monospace, SFMono-Regular, monospace"
					axisFontSize={12}
					axisValueFormatter={formatRankAxisValue}
					cardStrokeColor="white"
					chartState={chartState}
					color="#3f5f86"
					gradientEndOpacity={0.08}
					gradientId={chartId}
					gradientStartOpacity={0.08}
					heightClassName={compact ? "h-[180px]" : "h-[320px]"}
					margin={{
						top: 2,
						right: 20,
						bottom: 0,
						left: 0,
					}}
					tooltipContainerClassName="border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm"
					tooltipDateClassName="text-[11px] text-gray-500"
					tooltipValueClassName="font-mono font-semibold text-[13px]"
					valueFormatter={formatRankValue}
					xAxisTickMargin={10}
					yAxisTickMargin={6}
					yAxisWidth={58}
				/>
			</div>
		</div>
	);
};
