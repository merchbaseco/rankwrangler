import { Chip } from '@heroui/react';
import { DataGrid, type DataGridColumn, ItemCardGroup } from '@heroui-pro/react';
import type { RouterOutputs } from '@/lib/trpc';
import { formatCount } from './metric-format';

type AdminStats = RouterOutputs['api']['app']['getAdminStats'];
type RefreshPolicyBucket =
    | AdminStats['keepaRefreshPolicyBuckets'][number]
    | AdminStats['spApiRefreshPolicyBuckets'][number];

/**
 * How often each slice of the catalog is refreshed, and how many Products sit
 * in it. Keepa and SP-API share the bucket shape, so one grid serves both.
 */
export const RefreshPolicyGrid = ({
    buckets,
    title,
}: {
    buckets: readonly RefreshPolicyBucket[];
    title: string;
}) => {
    const autoRefreshed = buckets
        .filter(bucket => bucket.isAutoRefresh)
        .reduce((total, bucket) => total + bucket.count, 0);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>{title}</ItemCardGroup.Title>
                <ItemCardGroup.Description>
                    <span className="font-mono">{formatCount(autoRefreshed)}</span> Products refresh
                    automatically.
                </ItemCardGroup.Description>
            </ItemCardGroup.Header>
            <DataGrid
                aria-label={title}
                columns={columns}
                data={[...buckets]}
                getRowId={bucket => bucket.key}
                renderEmptyState={() => 'No refresh buckets.'}
            />
        </ItemCardGroup>
    );
};

const columns: DataGridColumn<RefreshPolicyBucket>[] = [
    {
        cell: bucket => <span className="font-mono">{bucket.label}</span>,
        header: 'Bucket',
        id: 'label',
        isRowHeader: true,
    },
    {
        accessorKey: 'refreshEveryLabel',
        cellClassName: 'text-muted',
        header: 'Policy',
        id: 'policy',
    },
    {
        align: 'end',
        cell: bucket => <span className="font-mono">{formatCount(bucket.count)}</span>,
        header: 'Products',
        id: 'count',
    },
    {
        align: 'end',
        cell: bucket =>
            bucket.isAutoRefresh ? (
                <Chip color="success" size="sm" variant="soft">
                    Auto
                </Chip>
            ) : (
                <Chip size="sm" variant="secondary">
                    Manual
                </Chip>
            ),
        header: 'Refresh',
        id: 'auto',
        width: 96,
    },
];
