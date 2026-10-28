import { JobExecutionsPanel } from "@/components/dashboard/job-executions-panel";
import { Button } from "@/components/ui/button";
import type { RouterOutputs } from "@/lib/trpc";
import { formatNumber } from "@/lib/utils";
import { useJobActivity } from "./use-job-activity";
import { useKeywordJobsStatus } from "./use-keyword-jobs-status";

type Status = RouterOutputs["api"]["app"]["jobs"]["keywordStatus"];
const KEYWORD_JOBS: [string, ...string[]] = [
	"schedule-keyword-work",
	"scan-keyword",
	"autocomplete-keyword",
	"import-brand-analytics",
];

export const KeywordJobsPanel = () => {
	useJobActivity(KEYWORD_JOBS);
	const query = useKeywordJobsStatus();
	if (query.isLoading)
		return (
			<p className="p-3 text-muted-foreground text-sm">Loading keyword jobs…</p>
		);
	if (!query.data)
		return (
			<section className="flex items-center justify-between p-3 text-sm">
				<p className="text-muted-foreground">Couldn’t load keyword jobs.</p>
				<Button onClick={() => query.refetch()} size="sm" variant="ghost">
					Retry
				</Button>
			</section>
		);
	return (
		<div className="space-y-3 p-3">
			<Summary status={query.data} />
			<BrandAnalyticsSummary status={query.data} />
			<ThemeSummary status={query.data} />
			<QueueTable status={query.data} />
			<JobExecutionsPanel jobNames={KEYWORD_JOBS} />
		</div>
	);
};

const Summary = ({ status }: { status: Status }) => {
	const { backlog } = status;
	const stats = [
		["Pipeline", status.paused ? "Paused" : "Running"],
		[
			"Scan backlog",
			`${formatNumber(backlog.queuedPages)} of ${formatNumber(backlog.allowancePages)} pages`,
		],
		[
			"New trials and autocomplete",
			status.paused
				? "Paused"
				: backlog.producersOpen
					? "Admitted"
					: "Held back (scan backlog)",
		],
		["Keyword checks due", formatNumber(backlog.dueHeads)],
		["Oldest due check", age(backlog.oldestDueHeadAt) ?? "None"],
		["Scan capacity", `${formatNumber(backlog.pagesPerDay)} pages/day`],
	];
	return (
		<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
			{stats.map(([label, value]) => (
				<div key={label}>
					<dt className="text-muted-foreground">{label}</dt>
					<dd className="font-medium tabular-nums">{value}</dd>
				</div>
			))}
		</dl>
	);
};

const BrandAnalyticsSummary = ({ status }: { status: Status }) => {
	const { latestWeek, lastImported, keptTerms, awaitingTrial, awaitingTheme } =
		status.brandAnalytics;
	const stats = [
		[
			"Last imported week",
			lastImported
				? `${lastImported.weekStart} – ${lastImported.weekEnd}`
				: "None yet",
		],
		["Kept search terms", formatNumber(keptTerms)],
		[
			"New terms last import",
			lastImported?.newTerms === null || !lastImported
				? "—"
				: formatNumber(lastImported.newTerms),
		],
		["Awaiting trial", formatNumber(awaitingTrial)],
		["Awaiting theme", formatNumber(awaitingTheme)],
		[
			"Report",
			latestWeek
				? `${latestWeek.weekStart}: ${reportState(latestWeek.status, latestWeek.reportStatus)}`
				: "Not requested",
		],
	];
	return (
		<section aria-label="Brand Analytics import" className="space-y-2">
			<h3 className="font-medium text-xs">Brand Analytics import</h3>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
				{stats.map(([label, value]) => (
					<div key={label}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="font-medium tabular-nums">{value}</dd>
					</div>
				))}
			</dl>
			{latestWeek?.lastError ? (
				<p
					className="truncate text-muted-foreground text-xs"
					title={latestWeek.lastError}
				>
					Last error: {latestWeek.lastError}
				</p>
			) : null}
		</section>
	);
};

const ThemeSummary = ({ status }: { status: Status }) => {
	const { total, expanded, pending } = status.themes;
	const stats = [
		["Themes", formatNumber(total)],
		["Expanded", formatNumber(expanded)],
		["Awaiting autocomplete", formatNumber(pending)],
	];
	return (
		<section aria-label="Keyword themes" className="space-y-2">
			<h3 className="font-medium text-xs">Keyword themes</h3>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
				{stats.map(([label, value]) => (
					<div key={label}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="font-medium tabular-nums">{value}</dd>
					</div>
				))}
			</dl>
		</section>
	);
};

const QueueTable = ({ status }: { status: Status }) => (
	<table className="w-full text-xs">
		<thead className="text-left text-muted-foreground">
			<tr className="h-8 border-border border-b">
				<th className="font-medium">Queue</th>
				<th className="font-medium">Provider</th>
				<th className="text-right font-medium">Waiting</th>
				<th className="text-right font-medium">Scheduled</th>
				<th className="text-right font-medium">Running</th>
				<th className="text-right font-medium">Oldest waiting</th>
			</tr>
		</thead>
		<tbody>
			{status.queues.map((queue) => (
				<tr className="h-10 border-border border-b" key={queue.name}>
					<td className="font-mono">{queue.name}</td>
					<td>
						{queue.provider}
						<span className="ml-1 text-muted-foreground">
							{providerState(status.paused, queue.providerReadyAt)}
						</span>
						{queue.usage ? (
							<span className="block text-muted-foreground">
								{formatNumber(queue.usage.startsToday)}
								{queue.usage.dailyLimit
									? ` of ${formatNumber(queue.usage.dailyLimit)}`
									: ""}{" "}
								calls today
							</span>
						) : null}
					</td>
					<td className="text-right tabular-nums">
						{formatNumber(queue.waiting)}
					</td>
					<td className="text-right tabular-nums">
						{formatNumber(queue.scheduled)}
					</td>
					<td className="text-right tabular-nums">
						{formatNumber(queue.running)}
					</td>
					<td className="text-right tabular-nums">
						{age(queue.oldestWaitingAt) ?? "—"}
					</td>
				</tr>
			))}
		</tbody>
	</table>
);

const reportState = (status: string, reportStatus: string | null) => {
	switch (status) {
		case "pending":
			return reportStatus
				? `waiting to request again (${reportStatus})`
				: "waiting to request";
		case "requested":
			return `generating${reportStatus ? ` (${reportStatus})` : ""}`;
		case "ready":
			return "importing";
		case "imported":
			return "imported";
		default:
			return status;
	}
};

const providerState = (paused: boolean, readyAt: string | null) => {
	if (paused) return "· paused";
	if (!readyAt) return "· ready";
	return `· waiting until ${new Date(readyAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
};

const age = (iso: string | null) => {
	if (!iso) return null;
	const minutes = Math.max(
		0,
		Math.round((Date.now() - Date.parse(iso)) / 60_000),
	);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
};
