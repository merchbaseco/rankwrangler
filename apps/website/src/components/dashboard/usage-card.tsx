import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useLicense } from '@/hooks/use-license';
import { formatNumber, formatRelativeTime } from '@/lib/utils';
import { UsageStat } from './usage-stat';

export function UsageCard() {
    const { license, isLoading } = useLicense();

    const hasLicense = Boolean(license);
    const usageToday = license?.usageToday ?? 0;
    const usageCount = license?.usageCount ?? 0;
    const dailyLimit = license?.usageLimit ?? 0;
    const isUnlimited = dailyLimit === -1;
    const progress =
        isUnlimited || dailyLimit === 0 ? 0 : (usageToday / dailyLimit) * 100;

    const usageTodayLabel = hasLicense ? formatNumber(usageToday) : '—';
    const usageCountLabel = hasLicense ? formatNumber(usageCount) : '—';
    const dailyLimitLabel = hasLicense
        ? isUnlimited
            ? 'Unlimited'
            : formatNumber(dailyLimit)
        : '—';
    const lastUsedLabel = hasLicense ? formatRelativeTime(license?.lastUsedAt) : '—';
    const progressLabel = hasLicense
        ? isUnlimited
            ? 'Unlimited plan'
            : `${Math.round(progress)}%`
        : '—';
    const progressValue = hasLicense ? (isUnlimited ? 100 : progress) : 0;

    return (
        <Card>
            <CardHeader>
                <div className="space-y-1">
                    <CardTitle>Usage</CardTitle>
                    <CardDescription>
                        Track requests and daily limits in real time.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-5">
                    {isLoading ? (
                        <CardDescription>Loading usage data.</CardDescription>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <UsageStat
                                    label="Requests today"
                                    value={usageTodayLabel}
                                    helper="Resets at midnight UTC"
                                />
                                <UsageStat
                                    label="Daily limit"
                                    value={dailyLimitLabel}
                                    helper="Plan allocation"
                                />
                                <UsageStat
                                    label="Total requests"
                                    value={usageCountLabel}
                                    helper="All-time"
                                />
                                <UsageStat
                                    label="Last used"
                                    value={lastUsedLabel}
                                    helper="Most recent API call"
                                />
                            </div>
                            <div className="space-y-2">
                                <CardDescription>Daily usage · {progressLabel}</CardDescription>
                                <Progress value={progressValue} />
                            </div>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
