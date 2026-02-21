import { buildChartGeometry, formatAxisValue, formatDateAxis, PAD, VB_H, VB_W } from '@/components/dashboard/product-history-panel/chart-utils';
import type { HistoryPoint } from '@/components/dashboard/product-history-panel/types';

export const ChartSvg = ({
	chartGeometry,
	color,
	hoverPosition,
	gradientId,
	metric,
}: {
	chartGeometry: NonNullable<ReturnType<typeof buildChartGeometry>>;
	color: string;
	hoverPosition: {
		x: number | null;
		y: number | null;
	};
	gradientId: string;
	metric: string;
}) => (
	<svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block w-full" style={{ aspectRatio: `${VB_W}/${VB_H}` }}>
		<defs>
			<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stopColor={color} stopOpacity="0.12" />
				<stop offset="100%" stopColor={color} stopOpacity="0" />
			</linearGradient>
		</defs>
		{chartGeometry.yTicks.map((tick, index) => (
			<g key={`y-${index}`}>
				<line
					x1={PAD.l}
					x2={VB_W - PAD.r}
					y1={tick.y}
					y2={tick.y}
					stroke="var(--color-border)"
					strokeWidth="1"
				/>
				<text
					x={PAD.l - 10}
					y={tick.y + 6}
					textAnchor="end"
					fill="var(--color-muted-foreground)"
					fontSize="18"
					style={{ fontFamily: 'var(--font-mono)' }}
				>
					{formatAxisValue(metric, tick.value)}
				</text>
			</g>
		))}
		{chartGeometry.xTicks.map((tick, index) => (
			<text
				key={`x-${index}`}
				x={tick.x}
				y={VB_H - 8}
				textAnchor={
					index === 0 ? 'start' : index === chartGeometry.xTicks.length - 1 ? 'end' : 'middle'
				}
				fill="var(--color-muted-foreground)"
				fontSize="18"
				style={{ fontFamily: 'var(--font-mono)' }}
			>
				{formatDateAxis(tick.ts)}
			</text>
		))}
		<path d={chartGeometry.areaPath} fill={`url(#${gradientId})`} />
		<path
			d={chartGeometry.linePath}
			fill="none"
			stroke={color}
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
		/>
		<circle
			cx={chartGeometry.lastX}
			cy={chartGeometry.lastY}
			r="3.5"
			fill={color}
			stroke="white"
			strokeWidth="2"
		/>
		{hoverPosition.x !== null && hoverPosition.y !== null ? (
			<>
				<line
					x1={hoverPosition.x}
					x2={hoverPosition.x}
					y1={PAD.t}
					y2={VB_H - PAD.b}
					stroke={color}
					strokeWidth="1"
					strokeDasharray="4 4"
					opacity="0.4"
				/>
				<circle
					cx={hoverPosition.x}
					cy={hoverPosition.y}
					r="4.5"
					fill={color}
					stroke="white"
					strokeWidth="2.5"
				/>
			</>
		) : null}
	</svg>
);

export const ChartTooltip = ({
	flip,
	hoverPoint,
	hoverXPercent,
	hoverYPercent,
	metric,
}: {
	flip: boolean;
	hoverPoint: HistoryPoint;
	hoverXPercent: number;
	hoverYPercent: number;
	metric: string;
}) => (
	<div
		className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg"
		style={{
			left: flip ? `calc(${hoverXPercent}% - 130px)` : `calc(${hoverXPercent}% + 14px)`,
			top: `calc(${hoverYPercent}% - 28px)`,
		}}
	>
		<p className="stat-value text-sm font-bold text-foreground">{formatValue(metric, hoverPoint.value)}</p>
		<p className="text-xs text-muted-foreground">{formatDateFull(hoverPoint.timestamp)}</p>
	</div>
);

const formatValue = (metric: string, value: number) => {
	if (isPriceMetric(metric)) {
		return `$${(value / 100).toFixed(2)}`;
	}
	return `#${value.toLocaleString()}`;
};

const formatDateFull = (timestamp: number) =>
	new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(new Date(timestamp));

const isPriceMetric = (metric: string) =>
	metric === 'priceAmazon' || metric === 'priceNew' || metric === 'priceNewFba';
