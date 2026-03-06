import { useMemo, useState } from "react";
import { withTimeDomainLabel } from "@/components/dashboard/metrics-time-domain-label";
import { TopSearchTermsDatasetTable } from "@/components/dashboard/top-search-terms-dataset-table";
import { TopSearchTermsJobExecutionsTable } from "@/components/dashboard/top-search-terms-job-executions-table";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/trpc";
import { cn, formatNumber } from "@/lib/utils";

const SETTINGS_METRICS_POLL_INTERVAL_MS = 10_000;
const TOP_SEARCH_TERMS_JOB_NAMES = [
	"fetch-top-search-terms-dataset",
	"sync-top-search-terms-datasets",
] as const;

type TopSearchTermsMetricView = "datasets" | "success" | "failed";
type DatasetTab = "daily" | "weekly";
type StatType = "neutral" | "success" | "error";

const STAT_STYLES: Record<
	StatType,
	{ colorClassName: string; stroke: string }
> = {
	neutral: {
		colorClassName: "text-foreground",
		stroke: "var(--color-foreground)",
	},
	success: {
		colorClassName: "text-success-foreground",
		stroke: "var(--color-success)",
	},
	error: {
		colorClassName: "text-destructive",
		stroke: "var(--color-destructive)",
	},
};

export const TopSearchTermsMetricsPanel = () => {
	const [selectedView, setSelectedView] =
		useState<TopSearchTermsMetricView>("datasets");
	const [datasetTab, setDatasetTab] = useState<DatasetTab>("daily");

	const statusQuery = api.api.app.topSearchTermsStatus.useQuery(undefined, {
		refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		retry: false,
	});
	const jobQueryInput = useMemo(() => {
		if (selectedView === "datasets") {
			return undefined;
		}

		return {
			limit: 100,
			status: selectedView,
			jobNames: [...TOP_SEARCH_TERMS_JOB_NAMES],
		};
	}, [selectedView]);
	const jobQuery = api.api.app.jobExecutions.useQuery(jobQueryInput, {
		enabled: jobQueryInput !== undefined,
		retry: false,
		refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
	});

	if (statusQuery.isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-muted-foreground">
					Loading Top Search Terms metrics…
				</p>
			</div>
		);
	}

	if (statusQuery.error || !statusQuery.data) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-destructive">
					Failed to load Top Search Terms metrics.
				</p>
			</div>
		);
	}

	const { stats, datasets } = statusQuery.data;
	const activeDatasetRows =
		datasetTab === "daily" ? datasets.daily : datasets.weekly;

	return (
		<div className="flex h-full flex-col">
			<div className="grid grid-cols-3 border-b border-border">
				<StatTile
					label="Top Search Terms"
					value={formatNumber(stats.totalTopSearchTerms)}
					valueClassName={STAT_STYLES.neutral.colorClassName}
					sparklineStroke={STAT_STYLES.neutral.stroke}
					buckets={toCumulativeBuckets(stats.topSearchTermsBuckets)}
					isSelected={selectedView === "datasets"}
					onClick={() => {
						if (selectedView === "datasets") {
							void statusQuery.refetch();
							return;
						}
						setSelectedView("datasets");
					}}
				/>
				<StatTile
					label={withTimeDomainLabel("Job Successes", stats.timeDomainLabel)}
					value={formatNumber(stats.jobSuccesses)}
					valueClassName={STAT_STYLES.success.colorClassName}
					sparklineStroke={STAT_STYLES.success.stroke}
					buckets={stats.jobSuccessBuckets}
					withLeftBorder
					isSelected={selectedView === "success"}
					onClick={() => {
						if (selectedView === "success") {
							void Promise.all([statusQuery.refetch(), jobQuery.refetch()]);
							return;
						}
						setSelectedView("success");
					}}
				/>
				<StatTile
					label={withTimeDomainLabel("Job Failures", stats.timeDomainLabel)}
					value={formatNumber(stats.jobFailures)}
					valueClassName={STAT_STYLES.error.colorClassName}
					sparklineStroke={STAT_STYLES.error.stroke}
					buckets={stats.jobFailureBuckets}
					withLeftBorder
					isSelected={selectedView === "failed"}
					onClick={() => {
						if (selectedView === "failed") {
							void Promise.all([statusQuery.refetch(), jobQuery.refetch()]);
							return;
						}
						setSelectedView("failed");
					}}
				/>
			</div>

			{selectedView === "datasets" && (
				<div className="flex items-center gap-0 border-b border-border">
					<DatasetTabButton
						label="Daily"
						count={datasets.daily.length}
						isActive={datasetTab === "daily"}
						onClick={() => setDatasetTab("daily")}
					/>
					<DatasetTabButton
						label="Weekly"
						count={datasets.weekly.length}
						isActive={datasetTab === "weekly"}
						onClick={() => setDatasetTab("weekly")}
					/>
				</div>
			)}

			<div className="min-h-0 flex-1 overflow-auto">
				{selectedView === "datasets" ? (
					<TopSearchTermsDatasetTable rows={activeDatasetRows} />
				) : jobQuery.isLoading ? (
					<p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
				) : jobQuery.error ? (
					<p className="px-3 py-2 text-xs text-destructive">
						Failed to load job executions.
					</p>
				) : (
					<TopSearchTermsJobExecutionsTable jobs={jobQuery.data ?? []} />
				)}
			</div>
		</div>
	);
};

const StatTile = ({
	label,
	value,
	valueClassName,
	sparklineStroke,
	buckets,
	onClick,
	isSelected = false,
	withLeftBorder = false,
}: {
	label: string;
	value: string;
	valueClassName: string;
	sparklineStroke: string;
	buckets: number[];
	onClick?: () => void;
	isSelected?: boolean;
	withLeftBorder?: boolean;
}) => {
	return (
			<Button
				onClick={onClick}
				className={cn(
					"h-auto w-full flex-col items-stretch justify-between p-3 text-left hover:bg-accent",
					withLeftBorder && "border-l border-border",
					isSelected && "bg-accent",
				)}
			size="sm"
			variant="ghost"
		>
			<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</p>
			<p
				className={cn(
					"stat-value mt-1 font-mono text-2xl font-bold",
					valueClassName,
				)}
			>
				{value}
			</p>
			<Sparkline buckets={buckets} stroke={sparklineStroke} id={label} />
		</Button>
	);
};

const DatasetTabButton = ({
	label,
	count,
	isActive,
	onClick,
}: {
	label: string;
	count: number;
	isActive: boolean;
	onClick: () => void;
}) => (
	<Button
		onClick={onClick}
		className={cn(
			"h-auto rounded-none px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider",
			isActive
				? "border-b-2 border-foreground text-foreground"
				: "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
		)}
		size="sm"
		variant="ghost"
	>
		{label}
		<span className="ml-1.5 font-mono text-muted-foreground">
			{formatNumber(count)}
		</span>
	</Button>
);

const SPARKLINE_VIEWBOX_WIDTH = 200;
const SPARKLINE_VIEWBOX_HEIGHT = 32;

const Sparkline = ({
	buckets,
	stroke,
	id,
}: {
	buckets: number[];
	stroke: string;
	id: string;
}) => {
	if (buckets.length === 0) {
		return null;
	}

	const maxValue = Math.max(...buckets, 1);
	const stepX = SPARKLINE_VIEWBOX_WIDTH / (buckets.length - 1 || 1);
	const normalizedId = id
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	const gradientId = `top-search-terms-spark-${normalizedId}`;

	const points = buckets.map((bucketValue, index) => ({
		x: index * stepX,
		y:
			SPARKLINE_VIEWBOX_HEIGHT -
			(bucketValue / maxValue) * SPARKLINE_VIEWBOX_HEIGHT * 0.85 -
			SPARKLINE_VIEWBOX_HEIGHT * 0.05,
	}));

	const linePath = points
		.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
		.join(" ");
	const areaPath = `${linePath} L${SPARKLINE_VIEWBOX_WIDTH},${SPARKLINE_VIEWBOX_HEIGHT} L0,${SPARKLINE_VIEWBOX_HEIGHT} Z`;

	return (
		<svg
			viewBox={`0 0 ${SPARKLINE_VIEWBOX_WIDTH} ${SPARKLINE_VIEWBOX_HEIGHT}`}
			className="mt-1.5 h-6 w-full"
			preserveAspectRatio="none"
		>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor={stroke} stopOpacity="0.12" />
					<stop offset="100%" stopColor={stroke} stopOpacity="0" />
				</linearGradient>
			</defs>
			<path d={areaPath} fill={`url(#${gradientId})`} />
			<path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" />
		</svg>
	);
};

const toCumulativeBuckets = (buckets: number[]) => {
	let runningTotal = 0;
	return buckets.map((bucket) => {
		runningTotal += bucket;
		return runningTotal;
	});
};
