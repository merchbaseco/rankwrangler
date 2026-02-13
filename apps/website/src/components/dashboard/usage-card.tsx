import { Progress } from '@/components/ui/progress';
import { useLicense } from '@/hooks/use-license';
import { formatNumber, formatRelativeTime } from '@/lib/utils';

export function UsageCard() {
    const { license, isLoading } = useLicense();

    const hasLicense = Boolean(license);
    const usageToday = license?.usageToday ?? 0;
    const usageCount = license?.usageCount ?? 0;
    const dailyLimit = license?.usageLimit ?? 0;
    const isUnlimited = dailyLimit === -1;
    const progress =
        isUnlimited || dailyLimit === 0 ? 0 : (usageToday / dailyLimit) * 100;

    const lastUsedLabel = hasLicense ? formatRelativeTime(license?.lastUsedAt) : 'Never';
    const progressValue = hasLicense ? (isUnlimited ? 100 : progress) : 0;

    if (isLoading) {
        return (
            <div className="space-y-3">
                <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#A89880]">
                    Usage
                </span>
                <p className="text-sm text-[#A89880]">Loading...</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#A89880]">
                Usage
            </span>

            {/* Big stat: requests today */}
            <div>
                <p className="stat-value text-5xl font-bold text-[#F5F0EB]">
                    {hasLicense ? formatNumber(usageToday) : '0'}
                </p>
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.1em] text-[#A89880]">
                    Requests today
                </p>
            </div>

            {/* Progress bar */}
            <div className="dark-progress space-y-2">
                <Progress value={progressValue} />
                <p className="text-xs text-[#A89880]">
                    {hasLicense
                        ? isUnlimited
                            ? 'Unlimited'
                            : `${Math.round(progress)}% of ${formatNumber(dailyLimit)}`
                        : '0%'}
                </p>
            </div>

            {/* Small stats */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="stat-value text-2xl font-semibold text-[#F5F0EB]">
                        {hasLicense ? formatNumber(usageCount) : '0'}
                    </p>
                    <p className="mt-1 text-xs text-[#A89880]">Total</p>
                </div>
                <div>
                    <p className="stat-value text-2xl font-semibold text-[#F5F0EB]">
                        {lastUsedLabel}
                    </p>
                    <p className="mt-1 text-xs text-[#A89880]">Last used</p>
                </div>
            </div>
        </div>
    );
}
