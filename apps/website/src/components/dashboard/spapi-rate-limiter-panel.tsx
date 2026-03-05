import type { RouterOutputs } from '@/lib/trpc';
import { formatNumber } from '@/lib/utils';

type SpApiOperationRateLimiterStat =
    RouterOutputs['api']['app']['getAdminStats']['spApiOperationRateLimiterStats'][number];

export const SpApiRateLimiterPanel = ({
    operationStats,
    isLoading,
}: {
    operationStats: SpApiOperationRateLimiterStat[];
    isLoading: boolean;
}) => {
    return (
        <div>
            <div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    SP-API Rate Limiting
                </p>
                {!isLoading && (
                    <p className="font-mono text-xs text-muted-foreground">
                        {formatNumber(operationStats.length)} ops
                    </p>
                )}
            </div>

            {isLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
            ) : operationStats.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No limiter stats.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="px-3 py-1 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Operation
                            </th>
                            <th className="px-3 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Effective RPS
                            </th>
                            <th className="px-3 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Config RPS
                            </th>
                            <th className="px-3 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Last Header
                            </th>
                            <th className="px-3 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Throttles
                            </th>
                            <th className="px-3 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Queue
                            </th>
                            <th className="px-3 py-1 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Reservoir
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {operationStats.map((stat) => (
                            <tr
                                key={stat.operationId}
                                className="border-b border-border last:border-0"
                            >
                                <td className="px-3 py-1 font-mono text-foreground">
                                    {stat.label}
                                </td>
                                <td className="px-3 py-1 text-right font-mono text-info-foreground">
                                    {formatRps(stat.effectiveRps)}
                                </td>
                                <td className="px-3 py-1 text-right font-mono text-muted-foreground">
                                    {formatRps(stat.configuredRps)}
                                </td>
                                <td className="px-3 py-1 text-right font-mono text-muted-foreground">
                                    {stat.lastObservedRateLimit === null
                                        ? '—'
                                        : formatRps(stat.lastObservedRateLimit)}
                                </td>
                                <td className="px-3 py-1 text-right font-mono text-destructive">
                                    {formatNumber(stat.throttles)}
                                </td>
                                <td className="px-3 py-1 text-right font-mono text-foreground">
                                    {formatNumber(stat.queued)}
                                </td>
                                <td className="px-3 py-1 text-right font-mono text-foreground">
                                    {stat.currentReservoir === null
                                        ? '—'
                                        : formatNumber(stat.currentReservoir)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

const formatRps = (value: number) => {
    if (!Number.isFinite(value)) {
        return '—';
    }

    if (value < 0.1) {
        return value.toFixed(4);
    }

    if (value < 1) {
        return value.toFixed(3);
    }

    if (value < 10) {
        return value.toFixed(2);
    }

    return value.toFixed(1);
};
