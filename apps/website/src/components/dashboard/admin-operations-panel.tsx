import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLicense } from "@/hooks/use-license";
import { api } from "@/lib/trpc";
import { formatNumber } from "@/lib/utils";
import { JobExecutionsPanel } from "./job-executions-panel";

export function AdminOperationsPanel() {
	const { license, isLoading: isLicenseLoading } = useLicense();
	const {
		data: keepaStatus,
		isLoading: isKeepaLoading,
		isFetching: isKeepaFetching,
		refetch: refetchKeepaStatus,
	} = api.api.app.getKeepaStatus.useQuery(undefined, {
		refetchInterval: 30000,
		refetchOnWindowFocus: false,
	});

	const usageCount = license?.usageCount ?? 0;
	const keepaTokensLeft = keepaStatus?.tokens.tokensLeft;
	const keepaQueueDueNow = keepaStatus?.queue.dueNow ?? 0;
	const keepaFetchesLastHour = keepaStatus?.queue.fetchesLastHour ?? 0;
	const keepaFetchesLastHourSuccess =
		keepaStatus?.queue.fetchesLastHourSuccess ?? 0;
	const keepaFetchesLastHourError = keepaStatus?.queue.fetchesLastHourError ?? 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="rounded-sm border border-border bg-card">
				<div className="flex items-center justify-between border-b border-border px-3 py-2">
					<div>
						<h2 className="font-display text-sm font-semibold text-foreground">
							Admin Runtime
						</h2>
						<p className="text-muted-foreground mt-0.5 text-xs">
							System metrics and queue health
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 rounded-sm text-xs"
						onClick={() => {
							void refetchKeepaStatus();
						}}
						disabled={isKeepaFetching}
					>
						{isKeepaFetching ? (
							<Loader2 className="size-3 animate-spin" />
						) : (
							<RefreshCw className="size-3" />
						)}
						Refresh
					</Button>
				</div>

				{isLicenseLoading && isKeepaLoading ? (
					<p className="text-muted-foreground px-3 py-3 text-sm">Loading runtime stats...</p>
				) : (
					<div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3 lg:grid-cols-6">
						<StatCard label="Total Products" value={formatNumber(usageCount)} />
						<StatCard
							label="Keepa Attempts (1h)"
							value={formatNumber(keepaFetchesLastHour)}
						/>
						<StatCard
							label="Keepa Success (1h)"
							value={formatNumber(keepaFetchesLastHourSuccess)}
						/>
						<StatCard
							label="Keepa Errors (1h)"
							value={formatNumber(keepaFetchesLastHourError)}
						/>
						<StatCard
							label="Keepa Tokens"
							value={
								typeof keepaTokensLeft === "number"
									? formatNumber(keepaTokensLeft)
									: "--"
							}
						/>
						<StatCard label="Keepa Queue Due" value={formatNumber(keepaQueueDueNow)} />
					</div>
				)}
			</div>

			<JobExecutionsPanel
				className="mt-0 min-h-0 flex-1"
				rowsClassName="max-h-[520px]"
			/>
		</div>
	);
}

const StatCard = ({ label, value }: { label: string; value: string }) => {
	return (
		<div className="flex flex-col rounded-sm border border-border bg-background p-2.5">
			<p className="stat-value text-lg font-semibold text-foreground">{value}</p>
			<p className="text-muted-foreground mt-1 text-xs uppercase tracking-wide">
				{label}
			</p>
		</div>
	);
};
