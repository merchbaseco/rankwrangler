import { format } from "date-fns";
import {
	CalendarDays,
	Check,
	Copy,
	ExternalLink,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// ─── Types & Config ───────────────────────────────────

type HistoryPoint = { timestamp: number; value: number };

type CategoryOption = { id: number; name: string | null };
type SelectOption = { value: string; label: string };

type ProductHistoryPanelProps = {
	product: {
		asin: string;
		marketplaceId: string;
		title: string | null;
		thumbnailUrl: string | null;
		brand: string | null;
	};
};

const DATE_RANGES = [
	{ key: "30d", label: "30 days", days: 30 },
	{ key: "90d", label: "90 days", days: 90 },
	{ key: "6m", label: "6 months", days: 180 },
	{ key: "1y", label: "1 year", days: 365 },
	{ key: "all", label: "All time", days: null },
] as const;

type DateRangeKey = (typeof DATE_RANGES)[number]["key"];
type ActiveRange = DateRangeKey | "custom";
type PickerValue = [Date, Date] | null;

// ─── Chart constants ──────────────────────────────────

const MAX_CHART_POINTS = 320;
const VB_W = 1000;
const VB_H = 340;
const PAD = { l: 80, r: 16, t: 16, b: 40 };
const INNER_W = VB_W - PAD.l - PAD.r;
const INNER_H = VB_H - PAD.t - PAD.b;
const Y_TICK_COUNT = 5;
const X_TICK_COUNT = 5;

// ─── Component ────────────────────────────────────────

export const ProductHistoryPanel = ({ product }: ProductHistoryPanelProps) => {
	const [activePreset, setActivePreset] = useState<ActiveRange>("1y");
	const [customRange, setCustomRange] = useState<PickerValue>(null);
	const [rankMetricValue, setRankMetricValue] = useState<string>("bsrMain");
	const [copied, setCopied] = useState(false);

	const amazonUrl = `https://www.amazon.com/dp/${product.asin}`;

	const handleCopyAsin = () => {
		navigator.clipboard.writeText(product.asin);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const { startAt, endAt } = useMemo(() => {
		if (activePreset === "custom" && customRange) {
			return {
				startAt: customRange[0].toISOString(),
				endAt: customRange[1].toISOString(),
			};
		}
		const range = DATE_RANGES.find((r) => r.key === activePreset);
		if (!range?.days) return { startAt: undefined, endAt: undefined };
		const date = new Date();
		date.setDate(date.getDate() - range.days);
		return { startAt: date.toISOString(), endAt: undefined };
	}, [activePreset, customRange]);

	const handlePresetClick = (key: DateRangeKey) => {
		setActivePreset(key);
		setCustomRange(null);
		setDatePickerRange(undefined);
	};

	const [datePickerRange, setDatePickerRange] = useState<
		DateRange | undefined
	>();

	const handleDateRangeSelect = (range: DateRange | undefined) => {
		if (datePickerRange?.from && !datePickerRange.to) {
			setDatePickerRange(range);
			if (range?.from && range?.to) {
				setCustomRange([range.from, range.to]);
				setActivePreset("custom");
			}
		}
	};

	const handleDayClick = (date: Date) => {
		if (datePickerRange?.from && !datePickerRange.to) {
			return;
		}
		setDatePickerRange({ from: date });
	};

	// ── Category discovery query ──────────────────────

	const categoryOptionsQuery = api.api.app.getProductHistory.useQuery(
		{
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: "bsrCategory",
			limit: 10_000,
		},
		{
			refetchOnWindowFocus: false,
			staleTime: 60_000,
		},
	);

	const availableCategories = useMemo(() => {
		if (!categoryOptionsQuery.data) return [] as CategoryOption[];
		const map = new Map<number, string | null>();
		for (const pt of categoryOptionsQuery.data.points) {
			if (!Number.isFinite(pt.categoryId) || pt.categoryId <= 0) continue;
			const name =
				categoryOptionsQuery.data.categoryNames[String(pt.categoryId)] ?? null;
			if (!map.has(pt.categoryId) || name) {
				map.set(pt.categoryId, name);
			}
		}
		return Array.from(map.entries())
			.sort((a, b) => a[0] - b[0])
			.map(([id, name]) => ({ id, name }));
	}, [categoryOptionsQuery.data]);

	// ── Main category name ──────────────────────────
	const mainCatQuery = api.api.app.getProductHistory.useQuery(
		{
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: "bsrMain",
			limit: 1,
		},
		{ refetchOnWindowFocus: false, staleTime: Infinity },
	);

	const mainCategoryName = useMemo(() => {
		const pt = mainCatQuery.data?.points[0];
		if (!pt) return "Main Category";
		return (
			mainCatQuery.data?.categoryNames[String(pt.categoryId)] ?? "Main Category"
		);
	}, [mainCatQuery.data]);
	const mainCategoryId = useMemo(() => {
		const categoryId = mainCatQuery.data?.points[0]?.categoryId;
		return Number.isFinite(categoryId) &&
			typeof categoryId === "number" &&
			categoryId > 0
			? categoryId
			: null;
	}, [mainCatQuery.data]);

	const rankSelectOptions = useMemo(() => {
		const categoryOptions = availableCategories
			.filter((category) => category.id !== mainCategoryId)
			.map((category) => ({
				value: `cat:${category.id}`,
				label: category.name ?? `#${category.id.toLocaleString()}`,
			}));

		return [
			{ value: "bsrMain", label: mainCategoryName },
			...categoryOptions,
		] satisfies SelectOption[];
	}, [availableCategories, mainCategoryId, mainCategoryName]);

	// Parse the rank select value into metric + optional categoryId
	const rankMetric = rankMetricValue.startsWith("cat:")
		? "bsrCategory"
		: "bsrMain";
	const rankCategoryId = rankMetricValue.startsWith("cat:")
		? Number(rankMetricValue.slice(4))
		: undefined;

	// ── Rank query ────────────────────────────────────

	const rankQueryInput = useMemo(
		() => ({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: rankMetric,
			limit: 5000,
			...(startAt ? { startAt } : {}),
			...(endAt ? { endAt } : {}),
			...(rankMetric === "bsrCategory" && typeof rankCategoryId === "number"
				? { categoryId: rankCategoryId }
				: {}),
		}),
		[
			product.marketplaceId,
			product.asin,
			rankMetric,
			rankCategoryId,
			startAt,
			endAt,
		],
	);

	const rankQuery = api.api.app.getProductHistory.useQuery(rankQueryInput, {
		refetchOnWindowFocus: false,
		staleTime: 30_000,
	});

	// ── Price query ───────────────────────────────────

	const priceQueryInput = useMemo(
		() => ({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: "priceAmazon" as const,
			limit: 5000,
			...(startAt ? { startAt } : {}),
			...(endAt ? { endAt } : {}),
		}),
		[product.marketplaceId, product.asin, startAt, endAt],
	);

	const priceQuery = api.api.app.getProductHistory.useQuery(priceQueryInput, {
		refetchOnWindowFocus: false,
		staleTime: 30_000,
	});

	// ── Sync mutation ─────────────────────────────────

	const loadMutation = api.api.app.loadProductHistory.useMutation({
		onSuccess: async (data) => {
			toastManager.add({
				type: "success",
				title: `Synced ${data.pointsStored.toLocaleString()} points from Keepa`,
			});
			await Promise.all([
				rankQuery.refetch(),
				priceQuery.refetch(),
				categoryOptionsQuery.refetch(),
			]);
		},
		onError: (error) => {
			toastManager.add({
				type: "error",
				title: "Sync failed",
				description: error.message,
			});
		},
	});

	const handleGenerate = () => {
		if (loadMutation.isPending) return;
		loadMutation.mutate({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			days: 365,
		});
	};

	// ── Render ────────────────────────────────────────

	return (
		<div className="flex h-full flex-col overflow-y-auto bg-background">
			{/* Header */}
			<div className="flex gap-3.5 px-5 pt-5 pb-3">
				{/* Thumbnail */}
				{product.thumbnailUrl ? (
					<div
						className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white"
						style={{ width: 56, aspectRatio: "4/5" }}
					>
						<img
							src={product.thumbnailUrl}
							alt=""
							className="h-[200%] w-[200%] max-w-none object-contain"
						/>
					</div>
				) : (
					<div
						className="bg-muted/40 flex shrink-0 items-center justify-center rounded-lg border border-border"
						style={{ width: 56, aspectRatio: "4/5" }}
					>
						<span className="text-muted-foreground text-lg">?</span>
					</div>
				)}

				{/* Product info */}
				<div className="min-w-0 flex-1">
					<h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
						{product.title ?? "Untitled product"}
					</h2>
					{product.brand && (
						<p className="mt-0.5 text-xs text-muted-foreground">
							{product.brand}
						</p>
					)}
					<div className="mt-1.5 flex items-center gap-2">
						<span className="font-mono text-xs text-muted-foreground">
							{product.asin}
						</span>
						<button
							type="button"
							onClick={handleCopyAsin}
							className="inline-flex items-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							title="Copy ASIN"
						>
							{copied ? (
								<Check className="size-3.5 text-emerald-500" />
							) : (
								<Copy className="size-3.5" />
							)}
						</button>
						<a
							href={amazonUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							title="View on Amazon"
						>
							<ExternalLink className="size-3.5" />
						</a>
						<button
							type="button"
							onClick={handleGenerate}
							disabled={loadMutation.isPending}
							className={cn(
								"ml-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
								loadMutation.isPending
									? "cursor-not-allowed text-muted-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-foreground",
							)}
						>
							{loadMutation.isPending ? (
								<Loader2 className="size-3 animate-spin" />
							) : (
								<RefreshCw className="size-3" />
							)}
							{loadMutation.isPending ? "Syncing..." : "Sync"}
						</button>
					</div>
				</div>
			</div>

			{/* Date range selector */}
			<div className="mt-3 px-5">
				<div className="flex items-center gap-1">
					{DATE_RANGES.map((r) => (
						<button
							key={r.key}
							type="button"
							onClick={() => handlePresetClick(r.key)}
							className={cn(
								"rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
								activePreset === r.key
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-accent",
							)}
						>
							{r.key === "all" ? "All" : r.key}
						</button>
					))}
					<Popover>
						<PopoverTrigger
							render={
								<Button
									variant={activePreset === "custom" ? "default" : "ghost"}
									className={cn(
										"h-auto gap-1 rounded-md px-2 py-1 text-xs font-medium border-transparent",
										activePreset !== "custom" && "text-muted-foreground",
									)}
								/>
							}
						>
							<CalendarDays className="size-3.5" />
							{customRange ? (
								<span>
									{format(customRange[0], "MMM d")} &ndash;{" "}
									{format(customRange[1], "MMM d, y")}
								</span>
							) : (
								<span>Custom</span>
							)}
						</PopoverTrigger>
						<PopoverPopup align="start">
							<Calendar
								mode="range"
								numberOfMonths={2}
								selected={datePickerRange}
								onSelect={handleDateRangeSelect}
								onDayClick={handleDayClick}
								defaultMonth={customRange?.[0]}
								disabled={{ after: new Date() }}
							/>
						</PopoverPopup>
					</Popover>
				</div>
			</div>

			{/* Charts */}
			<div className="mt-4 flex flex-1 flex-col gap-5 px-5 pb-5">
				{/* ── Rank chart ─────────────────────── */}
				<ChartSection
					label="Rank"
					selectValue={rankMetricValue}
					onSelectChange={setRankMetricValue}
					selectOptions={rankSelectOptions}
					query={rankQuery}
					metric={rankMetric}
					isPrice={false}
					gradientId={`rank-${product.asin}`}
				/>

				{/* ── Price chart ────────────────────── */}
				<ChartSection
					label="Price (Amazon)"
					selectValue=""
					onSelectChange={() => {}}
					selectOptions={[]}
					query={priceQuery}
					metric="priceAmazon"
					isPrice={true}
					gradientId={`price-${product.asin}`}
				/>
			</div>
		</div>
	);
};

// ─── Chart Section ────────────────────────────────────

type ChartSectionProps = {
	label: string;
	selectValue: string;
	onSelectChange: (value: string) => void;
	selectOptions: SelectOption[];
	query: {
		data?: {
			points: {
				isMissing: boolean;
				value: number | null;
				observedAt: string;
			}[];
		};
		isLoading: boolean;
		isError: boolean;
		error?: { message: string } | null;
	};
	metric: string;
	isPrice: boolean;
	gradientId: string;
};

const ChartSection = ({
	label,
	selectValue,
	onSelectChange,
	selectOptions,
	query,
	metric,
	isPrice,
	gradientId,
}: ChartSectionProps) => {
	const [hoverIdx, setHoverIdx] = useState<number | null>(null);
	const chartRef = useRef<HTMLDivElement>(null);

	const points = useMemo(() => {
		if (!query.data) return [] as HistoryPoint[];
		return query.data.points
			.filter(
				(p) =>
					!p.isMissing &&
					typeof p.value === "number" &&
					Number.isFinite(p.value),
			)
			.map((p) => ({
				timestamp: Date.parse(p.observedAt),
				value: p.value as number,
			}))
			.filter((p) => Number.isFinite(p.timestamp));
	}, [query.data]);

	const sampled = useMemo(
		() => downsamplePoints(points, MAX_CHART_POINTS),
		[points],
	);

	const chartGeo = useMemo(() => buildChartGeometry(sampled), [sampled]);
	const latestPoint = points.at(-1) ?? null;
	const firstPoint = points[0] ?? null;

	// Hover
	const hoverPoint = hoverIdx !== null ? (sampled[hoverIdx] ?? null) : null;
	const hoverX =
		hoverPoint && chartGeo
			? PAD.l +
				((hoverPoint.timestamp - chartGeo.tMin) /
					Math.max(1, chartGeo.tMax - chartGeo.tMin)) *
					INNER_W
			: null;
	const hoverY =
		hoverPoint && chartGeo
			? PAD.t +
				((chartGeo.vMax - hoverPoint.value) /
					Math.max(1, chartGeo.vMax - chartGeo.vMin)) *
					INNER_H
			: null;

	const tooltipLeftPct = hoverX !== null ? (hoverX / VB_W) * 100 : 0;
	const tooltipTopPct = hoverY !== null ? (hoverY / VB_H) * 100 : 0;
	const flipTooltip = tooltipLeftPct > 65;

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!chartGeo || sampled.length === 0) return;
			const el = chartRef.current;
			if (!el) return;
			const rect = el.getBoundingClientRect();
			const svgX = ((e.clientX - rect.left) / rect.width) * VB_W;
			if (svgX < PAD.l || svgX > VB_W - PAD.r) {
				setHoverIdx(null);
				return;
			}
			const frac = (svgX - PAD.l) / INNER_W;
			const targetTs = chartGeo.tMin + frac * (chartGeo.tMax - chartGeo.tMin);
			let best = 0;
			let bestDist = Infinity;
			for (let i = 0; i < sampled.length; i++) {
				const d = Math.abs(sampled[i].timestamp - targetTs);
				if (d < bestDist) {
					bestDist = d;
					best = i;
				}
			}
			setHoverIdx(best);
		},
		[chartGeo, sampled],
	);

	const loading = query.isLoading && !query.data;
	const hasData = points.length > 0 && chartGeo;
	const selectedOptionLabel = useMemo(
		() =>
			selectOptions.find((option) => option.value === selectValue)?.label ??
			selectValue,
		[selectOptions, selectValue],
	);

	return (
		<div className="rounded-xl border border-border bg-white">
			{/* Section header */}
			<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
				<span className="text-xs font-semibold text-secondary-foreground">
					{label}
				</span>
				{selectOptions.length > 0 && (
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
							{selectOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectPopup>
					</Select>
				)}
			</div>

			<div className="p-4">
				{loading && <ChartSkeleton />}

				{query.isError && (
					<div className="rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs text-red-700">
						{query.error?.message}
					</div>
				)}

				{!loading && !query.isError && points.length === 0 && (
					<div className="bg-muted/30 flex items-center justify-center rounded-lg border border-dashed border-border py-8">
						<p className="text-sm text-muted-foreground">
							No data yet. Click Sync to fetch history.
						</p>
					</div>
				)}

				{hasData && (
					<>
						{/* Hero stat */}
						<div className="mb-3">
							<p className="stat-value text-2xl font-bold tracking-tight text-foreground">
								{latestPoint ? formatValue(metric, latestPoint.value) : "-"}
							</p>
							{firstPoint && latestPoint && (
								<p className="mt-0.5 text-sm text-muted-foreground">
									{formatDateShort(firstPoint.timestamp)} &ndash;{" "}
									{formatDateShort(latestPoint.timestamp)}
								</p>
							)}
						</div>

						{/* Chart */}
						<div
							ref={chartRef}
							className="relative cursor-crosshair rounded-lg border border-border"
							onMouseMove={handleMouseMove}
							onMouseLeave={() => setHoverIdx(null)}
						>
							<svg
								viewBox={`0 0 ${VB_W} ${VB_H}`}
								className="block w-full"
								style={{ aspectRatio: `${VB_W}/${VB_H}` }}
							>
								<defs>
									<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
										<stop
											offset="0%"
											stopColor={
												isPrice ? "var(--color-chart-4)" : "var(--color-chart-1)"
											}
											stopOpacity="0.12"
										/>
										<stop
											offset="100%"
											stopColor={
												isPrice ? "var(--color-chart-4)" : "var(--color-chart-1)"
											}
											stopOpacity="0"
										/>
									</linearGradient>
								</defs>

								{/* Y-axis grid lines + labels */}
								{chartGeo.yTicks.map((tick, i) => (
									<g key={i}>
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
											style={{ fontFamily: "var(--font-mono)" }}
										>
											{formatAxisValue(metric, tick.value)}
										</text>
									</g>
								))}

								{/* X-axis labels */}
								{chartGeo.xTicks.map((tick, i) => (
									<text
										key={i}
										x={tick.x}
										y={VB_H - 8}
										textAnchor={
											i === 0
												? "start"
												: i === chartGeo.xTicks.length - 1
													? "end"
													: "middle"
										}
										fill="var(--color-muted-foreground)"
										fontSize="18"
										style={{ fontFamily: "var(--font-mono)" }}
									>
										{formatDateAxis(tick.ts)}
									</text>
								))}

								{/* Area fill */}
								<path d={chartGeo.areaPath} fill={`url(#${gradientId})`} />

								{/* Line */}
								<path
									d={chartGeo.linePath}
									fill="none"
									stroke={
										isPrice ? "var(--color-chart-4)" : "var(--color-chart-1)"
									}
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
								/>

								{/* Latest point */}
								<circle
									cx={chartGeo.lastX}
									cy={chartGeo.lastY}
									r="3.5"
									fill={
										isPrice ? "var(--color-chart-4)" : "var(--color-chart-1)"
									}
									stroke="white"
									strokeWidth="2"
								/>

								{/* Hover crosshair + dot */}
								{hoverX !== null && hoverY !== null && (
									<>
										<line
											x1={hoverX}
											x2={hoverX}
											y1={PAD.t}
											y2={VB_H - PAD.b}
											stroke={
												isPrice ? "var(--color-chart-4)" : "var(--color-chart-1)"
											}
											strokeWidth="1"
											strokeDasharray="4 4"
											opacity="0.4"
										/>
										<circle
											cx={hoverX}
											cy={hoverY}
											r="4.5"
											fill={
												isPrice ? "var(--color-chart-4)" : "var(--color-chart-1)"
											}
											stroke="white"
											strokeWidth="2.5"
										/>
									</>
								)}
							</svg>

							{/* Hover tooltip */}
							{hoverPoint && (
								<div
									className="pointer-events-none absolute z-10 rounded-lg border border-border bg-popover px-3 py-2 shadow-lg"
									style={{
										left: flipTooltip
											? `calc(${tooltipLeftPct}% - 130px)`
											: `calc(${tooltipLeftPct}% + 14px)`,
										top: `calc(${tooltipTopPct}% - 28px)`,
									}}
								>
									<p className="stat-value text-sm font-bold text-foreground">
										{formatValue(metric, hoverPoint.value)}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatDateFull(hoverPoint.timestamp)}
									</p>
								</div>
							)}
						</div>
					</>
				)}
			</div>
		</div>
	);
};

// ─── Sub-components ───────────────────────────────────

const ChartSkeleton = () => (
	<div className="space-y-2">
		<div className="bg-muted h-7 w-24 animate-pulse rounded" />
		<div className="bg-muted h-3 w-36 animate-pulse rounded" />
		<div className="bg-muted h-[160px] animate-pulse rounded-lg" />
	</div>
);

// ─── Helpers ──────────────────────────────────────────

const downsamplePoints = (points: HistoryPoint[], max: number) => {
	if (points.length <= max) return points;
	const step = Math.max(1, Math.floor(points.length / max));
	const out: HistoryPoint[] = [];
	for (let i = 0; i < points.length; i += step) {
		const p = points[i];
		if (p) out.push(p);
	}
	const last = points.at(-1);
	if (last && out.at(-1)?.timestamp !== last.timestamp) {
		out.push(last);
	}
	return out;
};

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

const buildChartGeometry = (points: HistoryPoint[]): ChartGeometry | null => {
	if (points.length === 0) return null;

	const timestamps = points.map((p) => p.timestamp);
	const values = points.map((p) => p.value);
	const tMin = Math.min(...timestamps);
	const tMax = Math.max(...timestamps);
	const rawMin = Math.min(...values);
	const rawMax = Math.max(...values);

	const rawRange = Math.max(1, rawMax - rawMin);
	const vPad = rawRange * 0.05;
	const vMin = Math.max(0, rawMin - vPad);
	const vMax = rawMax + vPad;

	const tRange = Math.max(1, tMax - tMin);
	const vRange = Math.max(1, vMax - vMin);

	const toX = (t: number) => PAD.l + ((t - tMin) / tRange) * INNER_W;
	const toY = (v: number) => PAD.t + ((vMax - v) / vRange) * INNER_H;

	const linePath = points
		.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.timestamp)} ${toY(p.value)}`)
		.join(" ");

	const fp = points[0];
	const lp = points.at(-1);
	if (!fp || !lp) return null;

	const baseY = PAD.t + INNER_H;
	const lastX = toX(lp.timestamp);
	const lastY = toY(lp.value);
	const areaPath = `${linePath} L ${lastX} ${baseY} L ${toX(fp.timestamp)} ${baseY} Z`;

	const yTicks = Array.from({ length: Y_TICK_COUNT }, (_, i) => {
		const frac = i / (Y_TICK_COUNT - 1);
		return {
			y: PAD.t + frac * INNER_H,
			value: Math.round(vMax - frac * (vMax - vMin)),
		};
	});

	const xTicks = Array.from({ length: X_TICK_COUNT }, (_, i) => {
		const frac = i / (X_TICK_COUNT - 1);
		return {
			x: PAD.l + frac * INNER_W,
			ts: tMin + frac * tRange,
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

const isPriceMetric = (m: string) =>
	m === "priceAmazon" || m === "priceNew" || m === "priceNewFba";

const formatValue = (metric: string, value: number) => {
	if (isPriceMetric(metric)) return `$${(value / 100).toFixed(2)}`;
	return `#${value.toLocaleString()}`;
};

const formatAxisValue = (metric: string, value: number) => {
	if (isPriceMetric(metric)) {
		const d = value / 100;
		return d >= 1000 ? `$${(d / 1000).toFixed(1)}k` : `$${d.toFixed(0)}`;
	}
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
	return String(value);
};

const formatDateAxis = (ts: number) =>
	new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
		new Date(ts),
	);

const formatDateShort = (ts: number) =>
	new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(
		new Date(ts),
	);

const formatDateFull = (ts: number) =>
	new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(ts));
