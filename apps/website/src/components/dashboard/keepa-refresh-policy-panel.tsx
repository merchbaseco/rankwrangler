import type { RouterOutputs } from '@/lib/trpc';
import { formatNumber } from '@/lib/utils';

type AdminStatsData = RouterOutputs['api']['app']['getAdminStats'];
type KeepaRefreshPolicyBucket = AdminStatsData['keepaRefreshPolicyBuckets'][number];

type KeepaRefreshPolicyPanelProps = {
    buckets: KeepaRefreshPolicyBucket[];
    fetchGuardLabel: string;
    queueLength: number | null;
    isLoading: boolean;
};

export const KeepaRefreshPolicyPanel = ({
    buckets,
    queueLength,
    isLoading,
}: KeepaRefreshPolicyPanelProps) => {
    const autoRefreshProducts = buckets
        .filter((bucket) => bucket.isAutoRefresh)
        .reduce((total, bucket) => total + bucket.count, 0);

    return (
        <div>
            <div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Keepa Refresh
                </p>
                {!isLoading && (
                    <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                        <p>
                            <span className="text-foreground">
                                {queueLength === null ? '—' : formatNumber(queueLength)}
                            </span>
                            <span className="ml-1 text-muted-foreground">queued</span>
                        </p>
                        <p>
                            <span className="text-success-foreground">
                                {formatNumber(autoRefreshProducts)}
                            </span>
                            <span className="ml-1 text-muted-foreground">auto</span>
                        </p>
                    </div>
                )}
            </div>

            {isLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
            ) : buckets.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No buckets.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="px-3 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Bucket
                            </th>
                            <th className="px-3 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Policy
                            </th>
                            <th className="px-3 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Count
                            </th>
                            <th className="w-6" />
                        </tr>
                    </thead>
                    <tbody>
                        {buckets.map((bucket) => (
                            <tr
                                key={bucket.key}
                                className="border-b border-border last:border-0"
                            >
                                <td className="px-3 py-1 font-mono text-foreground">
                                    {bucket.label}
                                </td>
                                <td className="px-3 py-1 text-muted-foreground">
                                    {bucket.refreshEveryLabel}
                                </td>
                                <td className="px-3 py-1 text-right font-mono tabular-nums text-foreground">
                                    {formatNumber(bucket.count)}
                                </td>
                                <td className="px-1 py-1 text-center">
                                    <span
                                        className={
                                            bucket.isAutoRefresh
                                                ? 'text-success'
                                                : 'text-muted-foreground/30'
                                        }
                                    >
                                        ●
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};
