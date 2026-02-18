import { Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/trpc';
import { Progress } from '@/components/ui/progress';
import { useLicense } from '@/hooks/use-license';
import { formatNumber } from '@/lib/utils';

export function UsageCard() {
    const { license, isLoading } = useLicense();
    const {
        data: keepaStatus,
        isFetching: isKeepaStatusFetching,
        refetch: refetchKeepaStatus,
    } = api.api.app.getKeepaStatus.useQuery(undefined, {
        refetchInterval: 30000,
        refetchOnWindowFocus: false,
    });

    const hasLicense = Boolean(license);
    const usageToday = license?.usageToday ?? 0;
    const usageCount = license?.usageCount ?? 0;
    const dailyLimit = license?.usageLimit ?? 0;
    const isUnlimited = dailyLimit === -1;
    const progress =
        isUnlimited || dailyLimit === 0 ? 0 : (usageToday / dailyLimit) * 100;

    const progressValue = hasLicense ? (isUnlimited ? 100 : progress) : 0;
    const keepaTokensLeft = keepaStatus?.tokens.tokensLeft;
    const keepaQueueDueNow = keepaStatus?.queue.dueNow ?? 0;
    const keepaFetchesLastHour = keepaStatus?.queue.fetchesLastHour ?? 0;
    const keepaFetchesLastHourSuccess = keepaStatus?.queue.fetchesLastHourSuccess ?? 0;
    const keepaFetchesLastHourError = keepaStatus?.queue.fetchesLastHourError ?? 0;

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
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#A89880]">
                    Usage
                </span>
                <button
                    type="button"
                    onClick={() => {
                        void refetchKeepaStatus();
                    }}
                    disabled={isKeepaStatusFetching}
                    className="shrink-0 text-[#A89880] transition-colors hover:text-[#F5F0EB] disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Refresh Keepa stats"
                    title="Refresh Keepa stats"
                >
                    {isKeepaStatusFetching ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <RefreshCw className="size-4" />
                    )}
                </button>
            </div>

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
                    <p className="mt-1 text-xs text-[#A89880]">Total products</p>
                </div>
                <div>
                    <p className="stat-value text-2xl font-semibold text-[#F5F0EB]">
                        {formatNumber(keepaFetchesLastHour)}
                    </p>
                    <p className="mt-1 text-xs text-[#A89880]">Keepa attempts (1h)</p>
                </div>
                <div>
                    <p className="stat-value text-2xl font-semibold text-[#F5F0EB]">
                        {formatNumber(keepaFetchesLastHourSuccess)}
                    </p>
                    <p className="mt-1 text-xs text-[#A89880]">Keepa success (1h)</p>
                </div>
                <div>
                    <p className="stat-value text-2xl font-semibold text-[#F5F0EB]">
                        {formatNumber(keepaFetchesLastHourError)}
                    </p>
                    <p className="mt-1 text-xs text-[#A89880]">Keepa errors (1h)</p>
                </div>
                <div>
                    <p className="stat-value text-2xl font-semibold text-[#F5F0EB]">
                        {typeof keepaTokensLeft === 'number'
                            ? formatNumber(keepaTokensLeft)
                            : '--'}
                    </p>
                    <p className="mt-1 text-xs text-[#A89880]">Keepa tokens</p>
                </div>
                <div>
                    <p className="stat-value text-2xl font-semibold text-[#F5F0EB]">
                        {formatNumber(keepaQueueDueNow)}
                    </p>
                    <p className="mt-1 text-xs text-[#A89880]">Keepa queue due</p>
                </div>
            </div>
        </div>
    );
}
