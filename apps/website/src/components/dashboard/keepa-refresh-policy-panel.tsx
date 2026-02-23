import { Badge } from '@/components/ui/badge';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { RouterOutputs } from '@/lib/trpc';
import { formatNumber } from '@/lib/utils';

type AdminStatsData = RouterOutputs['api']['app']['getAdminStats'];
type KeepaRefreshPolicyBucket = AdminStatsData['keepaRefreshPolicyBuckets'][number];

type KeepaRefreshPolicyPanelProps = {
    buckets: KeepaRefreshPolicyBucket[];
    fetchGuardLabel: string;
    isLoading: boolean;
};

export const KeepaRefreshPolicyPanel = ({
    buckets,
    fetchGuardLabel,
    isLoading,
}: KeepaRefreshPolicyPanelProps) => {
    const autoRefreshProducts = buckets
        .filter((bucket) => bucket.isAutoRefresh)
        .reduce((total, bucket) => total + bucket.count, 0);

    return (
        <div className="border-t border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3">
                <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Keepa Refresh Policy
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{fetchGuardLabel}</p>
                </div>
                {!isLoading ? (
                    <Badge variant="outline" size="sm">
                        {formatNumber(autoRefreshProducts)} auto-enqueue eligible
                    </Badge>
                ) : null}
            </div>

            {isLoading ? (
                <p className="text-muted-foreground px-3 py-3 text-sm">Loading Keepa policy buckets...</p>
            ) : null}

            {!isLoading && buckets.length === 0 ? (
                <p className="text-muted-foreground px-3 py-3 text-sm">No products found for Keepa buckets.</p>
            ) : null}

            {!isLoading && buckets.length > 0 ? (
                <div className="overflow-auto">
                    <table className="w-full table-auto text-sm">
                        <colgroup>
                            <col className="w-[300px]" />
                            <col className="w-[260px]" />
                            <col className="w-[160px]" />
                            <col className="w-[130px]" />
                        </colgroup>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Eligibility Bucket</TableHead>
                                <TableHead>Refresh Policy</TableHead>
                                <TableHead className="text-right">Products</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {buckets.map((bucket) => (
                                <TableRow key={bucket.key}>
                                    <TableCell className="font-mono text-xs text-foreground">
                                        {bucket.label}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {bucket.refreshEveryLabel}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs text-foreground">
                                        {formatNumber(bucket.count)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={bucket.isAutoRefresh ? 'success' : 'outline'}
                                            size="sm"
                                        >
                                            {bucket.isAutoRefresh ? 'Auto enqueue' : 'Manual only'}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </table>
                </div>
            ) : null}
        </div>
    );
};
