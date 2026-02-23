import { useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceDot,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { buildPoints } from "@/components/dashboard/product-history-panel/chart-data";
import {
	buildEvenYAxisScale,
	downsamplePoints,
	formatAxisValue,
	formatDateAxis,
	formatDateShort,
	formatValue,
	MAX_CHART_POINTS,
} from "@/components/dashboard/product-history-panel/chart-utils";
import {
	ChartSkeleton,
	SyncingChartPlaceholder,
} from "@/components/dashboard/product-history-panel/syncing-chart-placeholder";
import type {
	HistoryQueryResult,
	HistoryTimeDomain,
	SelectOption,
} from "@/components/dashboard/product-history-panel/types";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type ChartSectionProps = {
	label: string;
	selectValue: string;
	onSelectChange: (value: string) => void;
	selectOptions: SelectOption[];
	query: HistoryQueryResult;
	metric: string;
	isPrice: boolean;
	gradientId: string;
	isSyncing?: boolean;
	timeDomain?: HistoryTimeDomain | null;
};

type ChartDatum = {
	timestamp: number;
	value: number;
};

export const ChartSection = ({
	label,
	selectValue,
	onSelectChange,
	selectOptions,
	query,
	metric,
	isPrice,
	gradientId,
	isSyncing,
	timeDomain,
}: ChartSectionProps) => {
	const points = useMemo(() => buildPoints(query), [query]);
	const sampledPoints = useMemo(
		() => downsamplePoints(points, MAX_CHART_POINTS),
		[points],
	);
	const latestPoint = sampledPoints.at(-1) ?? null;
	const firstPoint = sampledPoints[0] ?? null;
	const rangeStartTimestamp =
		timeDomain?.startAt ?? firstPoint?.timestamp ?? null;
	const rangeEndTimestamp = timeDomain?.endAt ?? latestPoint?.timestamp ?? null;

	const selectedOptionLabel = useMemo(
		() =>
			selectOptions.find((option) => option.value === selectValue)?.label ??
			selectValue,
		[selectOptions, selectValue],
	);

	const isLoading = query.isLoading && !query.data;
	const hasData = sampledPoints.length > 0;
	const color = isPrice ? "var(--color-chart-4)" : "var(--color-chart-1)";
	const xDomain = useMemo<[number, number] | undefined>(() => {
		if (rangeStartTimestamp === null || rangeEndTimestamp === null) {
			return undefined;
		}

		const min = Math.min(rangeStartTimestamp, rangeEndTimestamp);
		const max = Math.max(rangeStartTimestamp, rangeEndTimestamp);
		if (min === max) {
			return [min - ONE_DAY_IN_MS, max + ONE_DAY_IN_MS];
		}
		return [min, max];
	}, [rangeEndTimestamp, rangeStartTimestamp]);
	const yScale = useMemo(
		() =>
			buildEvenYAxisScale(
				sampledPoints.map((point) => point.value),
				{ min: 0, tickCount: 5 },
			),
		[sampledPoints],
	);

	const chartData = sampledPoints as ChartDatum[];

	return (
		<div className="rounded-xl border border-border bg-white">
			<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
				<span className="text-xs font-semibold text-secondary-foreground">
					{label}
				</span>
				{selectOptions.length > 0 ? (
					<Select
						value={selectValue}
						onValueChange={(value) => {
							if (value) {
								onSelectChange(value);
							}
						}}
					>
						<SelectTrigger size="sm" className="w-auto">
							<SelectValue>{selectedOptionLabel}</SelectValue>
						</SelectTrigger>
						<SelectPopup>
							{selectOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectPopup>
					</Select>
				) : null}
			</div>
			<div className="p-4">
				{isLoading ? <ChartSkeleton /> : null}
				{query.isError ? (
					<div className="rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs text-red-700">
						{query.error?.message}
					</div>
				) : null}
				{!isLoading && !query.isError && sampledPoints.length === 0 ? (
					isSyncing ? (
						<SyncingChartPlaceholder color={color} gradientId={gradientId} />
					) : (
						<div className="bg-muted/30 flex items-center justify-center rounded-lg border border-dashed border-border py-8">
							<p className="text-sm text-muted-foreground">
								No data for this range yet.
							</p>
						</div>
					)
				) : null}
				{hasData ? (
					<>
						<div className="mb-3">
							<p className="stat-value text-2xl font-bold tracking-tight text-foreground">
								{latestPoint ? formatValue(metric, latestPoint.value) : "-"}
							</p>
							{rangeStartTimestamp !== null && rangeEndTimestamp !== null ? (
								<p className="mt-0.5 text-sm text-muted-foreground">
									{formatDateShort(rangeStartTimestamp)} &ndash;{" "}
									{formatDateShort(rangeEndTimestamp)}
								</p>
							) : null}
						</div>
						<div className="h-[220px] cursor-crosshair rounded-lg border border-border">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart
									data={chartData}
									margin={{ top: 16, right: 16, bottom: 16, left: 10 }}
								>
									<defs>
										<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
											<stop offset="0%" stopColor={color} stopOpacity="0.12" />
											<stop offset="100%" stopColor={color} stopOpacity="0" />
										</linearGradient>
									</defs>
									<CartesianGrid
										stroke="var(--color-border)"
										strokeDasharray="0"
										vertical={false}
									/>
									<XAxis
										type="number"
										dataKey="timestamp"
										domain={xDomain ?? ["auto", "auto"]}
										tickFormatter={formatDateAxis}
										axisLine={false}
										tickLine={false}
										minTickGap={24}
										tickMargin={8}
										style={{
											fill: "var(--color-muted-foreground)",
											fontSize: 12,
										}}
									/>
										<YAxis
											type="number"
											domain={yScale.domain}
											ticks={yScale.ticks}
											width={54}
											tickFormatter={(value) =>
												formatAxisValue(metric, Number(value))
										}
										axisLine={false}
										tickLine={false}
										tickMargin={8}
										style={{
											fill: "var(--color-muted-foreground)",
											fontSize: 12,
										}}
									/>
									<Tooltip
										isAnimationActive={false}
										cursor={{
											stroke: color,
											strokeDasharray: "4 4",
											strokeWidth: 1,
											opacity: 0.4,
										}}
										content={<HistoryTooltip metric={metric} />}
									/>
									<Area
										type="monotone"
										dataKey="value"
										stroke={color}
										strokeWidth={2}
										fill={`url(#${gradientId})`}
										isAnimationActive={false}
										dot={false}
										activeDot={{
											r: 4.5,
											fill: color,
											stroke: "white",
											strokeWidth: 2.5,
										}}
									/>
									{latestPoint ? (
										<ReferenceDot
											x={latestPoint.timestamp}
											y={latestPoint.value}
											r={3.5}
											fill={color}
											stroke="white"
											strokeWidth={2}
											ifOverflow="hidden"
										/>
									) : null}
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</>
				) : null}
			</div>
		</div>
	);
};

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

const HistoryTooltip = ({
	active,
	payload,
	metric,
}: {
	active?: boolean;
	payload?: Array<{ payload?: ChartDatum }>;
	metric: string;
}) => {
	const point = payload?.[0]?.payload;
	if (!active || !point) {
		return null;
	}

	return (
		<div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
			<p className="stat-value text-sm font-bold text-foreground">
				{formatValue(metric, point.value)}
			</p>
			<p className="text-xs text-muted-foreground">
				{formatDateShort(point.timestamp)}
			</p>
		</div>
	);
};
