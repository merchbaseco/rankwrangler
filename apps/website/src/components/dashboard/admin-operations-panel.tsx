import { Loader2, RefreshCw } from "lucide-react";
import { Frame } from "@/components/ui/frame";
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
	const keepaFetchesLastHourError =
		keepaStatus?.queue.fetchesLastHourError ?? 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<Frame>
				<div className="flex items-center justify-between border-b border-[rgba(20,18,16,0.08)] px-4 py-3">
					<div>
						<p className="font-mono text-xs uppercase tracking-[0.15em] text-[#706454]">
							Admin Runtime
						</p>
						<p className="mt-1 text-xs text-[#857869]">
							Detailed system stats and queue health
						</p>
					</div>
					<button
						type="button"
						onClick={() => {
							void refetchKeepaStatus();
						}}
						disabled={isKeepaFetching}
						className="rounded-md p-1.5 text-[#706454] transition-colors hover:bg-[rgba(20,18,16,0.08)] hover:text-[#221f1b] disabled:opacity-50"
						aria-label="Refresh runtime stats"
						title="Refresh runtime stats"
					>
						{isKeepaFetching ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<RefreshCw className="size-4" />
						)}
					</button>
				</div>

				{isLicenseLoading && isKeepaLoading ? (
					<p className="px-4 py-3 text-sm text-[#857869]">
						Loading runtime stats...
					</p>
				) : (
					<div className="grid grid-cols-2 gap-3 px-4 py-4 lg:grid-cols-3">
						<StatCard label="Total products" value={formatNumber(usageCount)} />
						<StatCard
							label="Keepa attempts (1h)"
							value={formatNumber(keepaFetchesLastHour)}
						/>
						<StatCard
							label="Keepa success (1h)"
							value={formatNumber(keepaFetchesLastHourSuccess)}
						/>
						<StatCard
							label="Keepa errors (1h)"
							value={formatNumber(keepaFetchesLastHourError)}
						/>
						<StatCard
							label="Keepa tokens"
							value={
								typeof keepaTokensLeft === "number"
									? formatNumber(keepaTokensLeft)
									: "--"
							}
						/>
						<StatCard
							label="Keepa queue due"
							value={formatNumber(keepaQueueDueNow)}
						/>
					</div>
				)}
			</Frame>

			<JobExecutionsPanel
				className="mt-0 min-h-0 flex-1"
				rowsClassName="max-h-[420px]"
			/>
		</div>
	);
}

const StatCard = ({ label, value }: { label: string; value: string }) => {
	return (
		<div className="rounded-lg border border-[rgba(20,18,16,0.08)] bg-white px-3 py-3">
			<p className="stat-value text-2xl font-semibold text-[#1C1917]">
				{value}
			</p>
			<p className="mt-1 text-xs text-[#857869]">{label}</p>
		</div>
	);
};
