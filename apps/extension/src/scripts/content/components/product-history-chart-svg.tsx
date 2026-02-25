import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { ChartPoint } from "../hooks/use-product-history";
import {
	formatChartValue,
	formatHoverDate,
} from "./product-history-chart-formatters";
import {
	CHART_PADDING,
	CHART_VIEWBOX_HEIGHT,
	CHART_VIEWBOX_WIDTH,
	type ChartGeometry,
	projectTimestampX,
	projectValueY,
} from "./product-history-chart-utils";
import { formatAxisValue } from "./product-history-chart-y-axis";

const CHART_COLOR = "rgb(95 135 135)";
const AXIS_FONT = "ui-monospace, SFMono-Regular, monospace";

export const ProductHistoryChartSvg = ({
	chartGeometry,
	chartId,
	compact,
	hoverPoint,
	hoverProjection,
	onPointerLeave,
	onPointerMove,
	svgRef,
	tooltipPosition,
	xTickFormatter,
	xTicks,
	yTicks,
	latestPoint,
}: {
	chartGeometry: ChartGeometry;
	chartId: string;
	compact: boolean;
	hoverPoint: ChartPoint | null;
	hoverProjection: {
		x: number;
		y: number;
	} | null;
	onPointerLeave: () => void;
	onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
	svgRef: RefObject<SVGSVGElement | null>;
	tooltipPosition: {
		flip: boolean;
		leftPercent: number;
		topPercent: number;
	} | null;
	xTickFormatter: (timestamp: number) => string;
	xTicks: number[];
	yTicks: number[];
	latestPoint: ChartPoint | null;
}) => {
	return (
		<div className={`${compact ? "h-[180px]" : "h-[320px]"} relative w-full`}>
			<svg
				className="block h-full w-full"
				onPointerLeave={onPointerLeave}
				onPointerMove={onPointerMove}
				preserveAspectRatio="none"
				ref={svgRef}
				viewBox={`0 0 ${CHART_VIEWBOX_WIDTH} ${CHART_VIEWBOX_HEIGHT}`}
			>
				<title>BSR history chart</title>
				<defs>
					<linearGradient id={chartId} x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stopColor={CHART_COLOR} stopOpacity="0.18" />
						<stop offset="100%" stopColor={CHART_COLOR} stopOpacity="0.01" />
					</linearGradient>
				</defs>

				{yTicks.map((tickValue) => {
					const y = projectValueY(tickValue, chartGeometry);
					return (
						<g key={`y-tick-${tickValue}`}>
							<line
								stroke="rgb(243 244 246)"
								strokeWidth="1"
								x1={CHART_PADDING.left}
								x2={CHART_VIEWBOX_WIDTH - CHART_PADDING.right}
								y1={y}
								y2={y}
							/>
							<text
								fill="rgb(107 114 128)"
								fontFamily={AXIS_FONT}
								fontSize="13"
								textAnchor="end"
								x={CHART_PADDING.left - 10}
								y={y + 4}
							>
								{formatAxisValue(tickValue)}
							</text>
						</g>
					);
				})}

				{xTicks.map((tickValue) => {
					const x = projectTimestampX(tickValue, chartGeometry);
					return (
						<g key={`x-tick-${tickValue}`}>
							<line
								stroke="rgb(243 244 246)"
								strokeWidth="1"
								x1={x}
								x2={x}
								y1={CHART_PADDING.top}
								y2={CHART_VIEWBOX_HEIGHT - CHART_PADDING.bottom}
							/>
							<text
								fill="rgb(107 114 128)"
								fontFamily={AXIS_FONT}
								fontSize="13"
								textAnchor="middle"
								x={x}
								y={CHART_VIEWBOX_HEIGHT - CHART_PADDING.bottom + 20}
							>
								{xTickFormatter(tickValue)}
							</text>
						</g>
					);
				})}

				<path d={chartGeometry.areaPath} fill={`url(#${chartId})`} />
				<path
					d={chartGeometry.linePath}
					fill="none"
					stroke={CHART_COLOR}
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2.5"
				/>

				{latestPoint ? (
					<circle
						cx={chartGeometry.lastX}
						cy={chartGeometry.lastY}
						fill={CHART_COLOR}
						r="3"
						stroke="white"
						strokeWidth="2"
					/>
				) : null}

				{hoverProjection ? (
					<>
						<line
							stroke={CHART_COLOR}
							strokeOpacity="0.3"
							strokeWidth="1.5"
							x1={hoverProjection.x}
							x2={hoverProjection.x}
							y1={CHART_PADDING.top}
							y2={CHART_VIEWBOX_HEIGHT - CHART_PADDING.bottom}
						/>
						<circle
							cx={hoverProjection.x}
							cy={hoverProjection.y}
							fill={CHART_COLOR}
							r="4"
							stroke="white"
							strokeWidth="2"
						/>
					</>
				) : null}
			</svg>

			{hoverPoint && tooltipPosition ? (
				<div
					className="pointer-events-none absolute z-10 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm"
					style={{
						left: `${tooltipPosition.leftPercent}%`,
						top: `${tooltipPosition.topPercent}%`,
						transform: tooltipPosition.flip
							? "translate(calc(-100% - 10px), -50%)"
							: "translate(10px, -50%)",
					}}
				>
					<p
						className="font-semibold text-[13px]"
						style={{ color: CHART_COLOR }}
					>
						{formatChartValue(hoverPoint.value)}
					</p>
					<p className="text-[11px] text-gray-500">
						{formatHoverDate(hoverPoint.timestamp)}
					</p>
				</div>
			) : null}
		</div>
	);
};
