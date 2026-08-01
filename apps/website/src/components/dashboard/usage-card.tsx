import { Progress } from "@/components/ui/progress";
import { useAccessUsage } from "@/hooks/use-access-usage";
import { formatNumber } from "@/lib/utils";

export const UsageCard = () => {
	const { usage, isLoading } = useAccessUsage();

	const hasUsage = Boolean(usage);
	const usageToday = usage?.usageToday ?? 0;
	const dailyLimit = usage?.usageLimit ?? 0;
	const isUnlimited = dailyLimit === -1;
	const progress =
		isUnlimited || dailyLimit <= 0
			? 0
			: Math.min(100, (usageToday / dailyLimit) * 100);

	return (
		<div>
			<div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
				<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					Usage
				</p>
				{!isLoading && hasUsage && (
					<p className="font-mono text-xs tabular-nums text-muted-foreground">
						{isUnlimited
							? "Unlimited"
							: `${Math.round(progress)}% of ${formatNumber(dailyLimit)}`}
					</p>
				)}
			</div>
			<div className="px-3 py-3">
				{isLoading ? (
					<p className="text-xs text-muted-foreground">Loading...</p>
				) : (
					<div className="flex items-center gap-4">
						<p className="stat-value font-mono text-2xl font-bold text-foreground">
							{hasUsage ? formatNumber(usageToday) : "0"}
						</p>
						<div className="min-w-0 flex-1">
							<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
								Requests today
							</p>
							<div className="mt-1.5">
								<Progress
									value={hasUsage ? (isUnlimited ? 100 : progress) : 0}
								/>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
