import { Progress } from "@/components/ui/progress";
import { useLicense } from "@/hooks/use-license";
import { formatNumber } from "@/lib/utils";

export function UsageCard() {
	const { license, isLoading } = useLicense();

	const hasLicense = Boolean(license);
	const usageToday = license?.usageToday ?? 0;
	const dailyLimit = license?.usageLimit ?? 0;
	const isUnlimited = dailyLimit === -1;
	const progress =
		isUnlimited || dailyLimit <= 0 ? 0 : Math.min(100, (usageToday / dailyLimit) * 100);

	return (
		<div className="rounded-sm border border-border bg-card p-3">
			<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
				Usage
			</p>
			{isLoading ? (
				<p className="text-muted-foreground mt-2 text-xs">Loading...</p>
			) : (
				<>
					<p className="stat-value mt-1 text-3xl font-semibold text-foreground">
						{hasLicense ? formatNumber(usageToday) : "0"}
					</p>
					<p className="text-muted-foreground mt-1 text-xs font-mono uppercase tracking-wide">
						Requests today
					</p>
					<div className="mt-2 space-y-1.5">
						<Progress value={hasLicense ? (isUnlimited ? 100 : progress) : 0} />
						<p className="text-muted-foreground text-xs">
							{hasLicense
								? isUnlimited
									? "Unlimited"
									: `${Math.round(progress)}% of ${formatNumber(dailyLimit)}`
								: "0%"}
						</p>
					</div>
				</>
			)}
		</div>
	);
}
