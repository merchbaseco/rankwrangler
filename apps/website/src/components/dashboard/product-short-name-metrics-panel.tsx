import { api } from "@/lib/trpc";
import { formatNumber } from "@/lib/utils";

const POLL_INTERVAL_MS = 10_000;

export const ProductShortNameMetricsPanel = () => {
	const query = api.api.app.getProductShortNameMetricsSummary.useQuery(undefined, {
		retry: false,
		refetchInterval: POLL_INTERVAL_MS,
		refetchIntervalInBackground: false,
	});

	if (query.isLoading) {
		return <p className="p-5 text-sm text-muted-foreground">Loading short-name metrics…</p>;
	}
	if (query.error || !query.data) {
		return <p className="p-5 text-sm text-destructive">Could not load short-name metrics.</p>;
	}

	const { coverage, activity, hourly, recent } = query.data;
	const maxHourly = Math.max(1, ...hourly.map((hour) => hour.generated + hour.failed));

	return (
		<div className="h-full overflow-y-auto">
			<div className="grid grid-cols-5 border-b border-border">
				<Metric label="Eligible Products" value={coverage.eligible} />
				<Metric label="Current (including no name)" value={coverage.ready} />
				<Metric label="Never Requested" value={coverage.neverRequested} />
				<Metric label="Needs Regeneration" value={coverage.needsRegeneration} />
				<Metric label="Pending / Failed" value={coverage.pending + coverage.error} />
			</div>
			<div className="grid grid-cols-5 border-b border-border">
				<Metric label="Completed · 24h" value={activity.generated} />
				<Metric label="Abstained · 24h" value={activity.abstained} />
				<Metric label="Failed · 24h" value={activity.failed} />
				<Metric
					label="Gemini Calls · 24h"
					value={activity.geminiCalls}
					detail={`${formatNumber(activity.geminiErrors)} errors`}
				/>
				<Metric
					label="Jev Calls · 24h"
					value={activity.typeSafeCalls}
					detail={`${formatNumber(activity.typeSafeErrors)} errors`}
				/>
			</div>
			<div className="border-b border-border px-5 py-4">
				<p className="text-xs font-medium text-foreground">
					Generation activity · last 24 hours
				</p>
				<div className="mt-4 flex h-28 items-end gap-1" aria-label="Hourly short-name generation activity">
					{hourly.map((hour) => (
						<div
							key={hour.hour}
							className="flex h-full flex-1 flex-col justify-end"
							title={`${hour.hour}: ${hour.generated} completed, ${hour.failed} failed`}
						>
							<div className="bg-destructive/70" style={{ height: `${(hour.failed / maxHourly) * 100}%` }} />
							<div className="bg-chart-2" style={{ height: `${(hour.generated / maxHourly) * 100}%` }} />
						</div>
					))}
				</div>
				<div className="mt-2 flex gap-4 text-xs text-muted-foreground">
					<span className="text-chart-2">■ Completed</span>
					<span className="text-destructive">■ Failed</span>
				</div>
			</div>
			<div className="px-5 py-4 text-xs text-muted-foreground">
				<p>
					Rows are created only after a short name is requested. A changed title or image is
					regenerated on the next request.
				</p>
			</div>
			<div className="border-t border-border px-5 py-4">
				<p className="mb-2 text-xs font-medium text-foreground">Recent generations</p>
				{recent.length === 0 ? <p className="text-xs text-muted-foreground">No generation activity yet.</p> : (
					<table className="w-full text-xs">
						<thead><tr className="text-left text-muted-foreground"><th className="pb-2">Product</th><th className="pb-2">Outcome</th><th className="pb-2">When</th></tr></thead>
						<tbody>{recent.map((row, index) => (
							<tr key={`${row.asin}-${row.occurredAt}-${index}`} className="border-t border-border">
								<td className="py-2 font-mono">{row.asin ?? "—"}</td>
								<td className="py-2">{row.status === "failed" ? "Failed" : row.outcome === "abstained" ? "No name" : "Named"}</td>
								<td className="py-2 text-muted-foreground">{new Date(row.occurredAt).toLocaleString()}</td>
							</tr>
						))}</tbody>
					</table>
				)}
			</div>
		</div>
	);
};

const Metric = ({
	label,
	value,
	detail,
}: {
	label: string;
	value: number;
	detail?: string;
}) => (
	<div className="border-r border-border p-4 last:border-r-0">
		<p className="text-xs text-muted-foreground">{label}</p>
		<p className="mt-1 font-mono text-xl font-semibold text-foreground">{formatNumber(value)}</p>
		{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
	</div>
);
