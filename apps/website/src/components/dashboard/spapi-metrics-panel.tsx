import { useMemo, useState } from "react";
import {
	type AdminStatLabel,
	isStatFilterLabel,
	type JobStatusFilter,
	STAT_FILTER_CONFIG,
} from "@/components/dashboard/admin-operations-panel-config";
import {
	formatDateTime,
	formatDuration,
} from "@/components/dashboard/job-executions-panel/formatters";
import { withTimeDomainLabel } from "@/components/dashboard/metrics-time-domain-label";
import { SpApiRateLimiterPanel } from "@/components/dashboard/spapi-rate-limiter-panel";
import { SpApiRefreshPolicyPanel } from "@/components/dashboard/spapi-refresh-policy-panel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/trpc";
import { cn, formatNumber } from "@/lib/utils";

const COLS = 3;
const SETTINGS_METRICS_POLL_INTERVAL_MS = 10_000;

type StatType = "neutral" | "success" | "error";

const STAT_STYLES: Record<StatType, { color: string; stroke: string }> = {
	neutral: { color: "text-foreground", stroke: "var(--color-foreground)" },
	success: { color: "text-success-foreground", stroke: "var(--color-success)" },
	error: { color: "text-destructive", stroke: "var(--color-destructive)" },
};

const getStatType = (label: string): StatType => {
	if (label.includes("Success")) return "success";
	if (label.includes("Errors") || label.includes("Failed")) return "error";
	return "neutral";
};

export const SpApiMetricsPanel = () => {
	const [selectedStat, setSelectedStat] = useState<AdminStatLabel | null>(null);

	const statsQuery = api.api.app.getAdminStats.useQuery(undefined, {
		refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
	});

	const allStats = statsQuery.data?.stats ?? [];
	const stats = allStats.filter((s) => s.label.startsWith("SP-API"));
	const timeDomainLabel = statsQuery.data?.timeDomainLabel;
	const refreshPolicyBuckets = statsQuery.data?.spApiRefreshPolicyBuckets ?? [];
	const operationRateLimiterStats =
		statsQuery.data?.spApiOperationRateLimiterStats ?? [];
	const isLoading = statsQuery.isLoading;

	const defaultSelectedStat = stats
		.map((stat) => stat.label)
		.find((label): label is AdminStatLabel => isStatFilterLabel(label));

	const effectiveSelectedStat = selectedStat ?? defaultSelectedStat ?? null;
	const selectedConfig =
		effectiveSelectedStat === null
			? undefined
			: STAT_FILTER_CONFIG[effectiveSelectedStat];

	const queryInput = useMemo(() => {
		if (selectedConfig === undefined) return undefined;
		const input: {
			limit: number;
			status?: JobStatusFilter;
			jobNames?: string[];
		} = {
			limit: 100,
		};
		if (selectedConfig.status !== undefined)
			input.status = selectedConfig.status;
		if (selectedConfig.jobNames !== undefined)
			input.jobNames = [...selectedConfig.jobNames];
		return input;
	}, [selectedConfig]);

	const jobQuery = api.api.app.jobExecutions.useQuery(queryInput, {
		enabled: selectedConfig !== undefined,
		retry: false,
		refetchInterval: SETTINGS_METRICS_POLL_INTERVAL_MS,
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
	});

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-muted-foreground">Loading SP-API metrics…</p>
			</div>
		);
	}

	const jobs = jobQuery.data;

	return (
		<div className="flex h-full flex-col">
			{/* Stat tiles — single row of 3 */}
			<div className="grid grid-cols-3">
				{stats.map((stat, i) => {
					const statType = getStatType(stat.label);
					const style = STAT_STYLES[statType];
					const hasDetailView = isStatFilterLabel(stat.label);
					const isSelected = effectiveSelectedStat === stat.label;

					return (
						<Button
							key={stat.label}
							disabled={!hasDetailView}
							onClick={() => {
								if (!hasDetailView) return;
								if (effectiveSelectedStat === stat.label) {
									void Promise.all([jobQuery.refetch(), statsQuery.refetch()]);
									return;
								}
								void statsQuery.refetch();
								setSelectedStat(stat.label);
							}}
								className={cn(
									"h-auto w-full flex-col items-stretch justify-between rounded-none p-3 text-left",
									i < COLS - 1 && "border-r border-border",
									hasDetailView && "cursor-pointer hover:bg-accent",
									!hasDetailView && "cursor-default disabled:opacity-100",
								isSelected && "bg-accent",
							)}
							size="sm"
							variant="ghost"
						>
							<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								{withTimeDomainLabel(stat.label, timeDomainLabel)}
							</p>
							<p
								className={cn(
									"stat-value font-mono text-2xl font-bold",
									style.color,
								)}
							>
								{formatNumber(stat.total)}
							</p>
							<Sparkline
								buckets={stat.buckets}
								stroke={style.stroke}
								id={stat.label}
							/>
						</Button>
					);
				})}
			</div>

			{/* SP-API refresh policy — full width */}
			<div className="border-t border-border">
				<SpApiRefreshPolicyPanel
					buckets={refreshPolicyBuckets}
					isLoading={isLoading}
				/>
			</div>

			<div className="border-t border-border">
				<SpApiRateLimiterPanel
					operationStats={operationRateLimiterStats}
					isLoading={isLoading}
				/>
			</div>

			{/* Job executions */}
			{selectedConfig ? (
				<div className="flex min-h-0 flex-1 flex-col border-t border-border">
					{jobQuery.isLoading ? (
						<p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
					) : jobQuery.error ? (
						<p className="px-3 py-2 text-xs text-destructive">
							Failed to load.
						</p>
					) : jobs && jobs.length === 0 ? (
						<p className="px-3 py-2 text-xs text-muted-foreground">
							No jobs found.
						</p>
					) : jobs && jobs.length > 0 ? (
						<div className="flex-1 overflow-auto">
							<table className="w-full text-xs">
								<thead className="sticky top-0 bg-accent">
									<tr className="border-b border-border">
										<th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
											Started
										</th>
										<th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
											Job
										</th>
										<th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
											Status
										</th>
										<th className="px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
											Duration
										</th>
										<th className="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
											Error
										</th>
									</tr>
								</thead>
								<tbody>
									{jobs.map((exec) => (
										<tr
											key={exec.id}
											className="border-b border-border last:border-0 hover:bg-muted/30"
										>
											<td className="whitespace-nowrap px-3 py-1 font-mono">
												{formatDateTime(exec.startedAt)}
											</td>
											<td className="max-w-[200px] truncate px-3 py-1 font-mono text-foreground">
												{exec.jobName}
											</td>
											<td className="whitespace-nowrap px-3 py-1">
												<span
													className={cn(
														"mr-1.5 inline-block size-1.5 rounded-full align-middle",
														exec.status === "success"
															? "bg-success"
															: "bg-destructive",
													)}
												/>
												<span className="font-mono uppercase">
													{exec.status}
												</span>
											</td>
											<td className="whitespace-nowrap px-3 py-1 text-right font-mono">
												{formatDuration(exec.durationMs)}
											</td>
											<td
												className={cn(
													"max-w-[140px] truncate px-3 py-1 font-mono",
													exec.errorMessage
														? "text-destructive"
														: "text-muted-foreground",
												)}
												title={exec.errorMessage ?? undefined}
											>
												{exec.errorMessage ?? "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
};

/* ── Sparkline ───────────────────────────── */

const VB_W = 200;
const VB_H = 32;

const Sparkline = ({
	buckets,
	stroke,
	id,
}: {
	buckets: number[];
	stroke: string;
	id: string;
}) => {
	if (buckets.length === 0) return null;

	const max = Math.max(...buckets, 1);
	const stepX = VB_W / (buckets.length - 1 || 1);
	const gradientId = `spark-${id.replace(/\s+/g, "-")}`;

	const points = buckets.map((v, i) => ({
		x: i * stepX,
		y: VB_H - (v / max) * VB_H * 0.85 - VB_H * 0.05,
	}));

	const linePath = points
		.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
		.join(" ");
	const areaPath = `${linePath} L${VB_W},${VB_H} L0,${VB_H} Z`;

	return (
		<svg
			viewBox={`0 0 ${VB_W} ${VB_H}`}
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
			<path
				d={linePath}
				fill="none"
				stroke={stroke}
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				opacity="0.6"
			/>
		</svg>
	);
};
