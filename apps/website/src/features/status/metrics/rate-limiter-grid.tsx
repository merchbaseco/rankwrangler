import { DataGrid, type DataGridColumn, ItemCardGroup } from '@heroui-pro/react';
import type { RouterOutputs } from '@/lib/trpc';
import { formatCount, formatRps } from './metric-format';

type RateLimiterStat =
    RouterOutputs['api']['app']['getAdminStats']['spApiOperationRateLimiterStats'][number];

/** Each SP-API operation's limiter: the rate it runs at, what Amazon allows, and its backlog. */
export const RateLimiterGrid = ({ stats }: { stats: readonly RateLimiterStat[] }) => (
    <ItemCardGroup variant="transparent">
        <ItemCardGroup.Header>
            <ItemCardGroup.Title>Rate limiting</ItemCardGroup.Title>
            <ItemCardGroup.Description>
                Effective rate per operation against its configured rate and Amazon’s last reported
                limit.
            </ItemCardGroup.Description>
        </ItemCardGroup.Header>
        <DataGrid
            aria-label="SP-API rate limiting"
            columns={columns}
            data={[...stats]}
            getRowId={stat => stat.operationId}
            renderEmptyState={() => 'No limiter stats.'}
        />
    </ItemCardGroup>
);

const mono = (value: string) => <span className="font-mono">{value}</span>;

const columns: DataGridColumn<RateLimiterStat>[] = [
    { cell: stat => mono(stat.label), header: 'Operation', id: 'label', isRowHeader: true },
    {
        align: 'end',
        cell: stat => mono(formatRps(stat.effectiveRps)),
        header: 'Effective RPS',
        id: 'effective',
    },
    {
        align: 'end',
        cell: stat => mono(formatRps(stat.configuredRps)),
        header: 'Config RPS',
        id: 'configured',
    },
    {
        align: 'end',
        cell: stat =>
            mono(stat.lastObservedRateLimit === null ? '—' : formatRps(stat.lastObservedRateLimit)),
        header: 'Last header',
        id: 'header',
    },
    {
        align: 'end',
        cell: stat => mono(formatCount(stat.throttles)),
        header: 'Throttles',
        id: 'throttles',
    },
    { align: 'end', cell: stat => mono(formatCount(stat.queued)), header: 'Queue', id: 'queued' },
    {
        align: 'end',
        cell: stat =>
            mono(stat.currentReservoir === null ? '—' : formatCount(stat.currentReservoir)),
        header: 'Reservoir',
        id: 'reservoir',
    },
];
