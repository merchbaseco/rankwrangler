import { Chip, Tooltip, useMediaQuery } from '@heroui/react';
import { DataGrid, type DataGridColumn } from '@heroui-pro/react';
import { InformationCircleIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import { formatCount, type RefreshTier } from './status-model';
import { StatusBlock } from './status-panel';

/**
 * A provider's refresh tiers: which BSR slice of the catalog it calls how often, and how many
 * Products sit in each. One line per tier; a tier whose rule needs more words than its label
 * carries them in an info tooltip.
 */
export const RefreshTierTable = ({
    label,
    tiers,
}: {
    label: string;
    tiers: readonly RefreshTier[] | undefined;
}) => {
    // A phone drops the Sync column: the cadence already says which tiers run on their own.
    const isPhone = !useMediaQuery('(min-width: 48rem)', { initializeWithValue: true });
    const automatic = (tiers ?? [])
        .filter(tier => tier.isAutoRefresh)
        .reduce((sum, tier) => sum + tier.count, 0);
    return (
        <StatusBlock
            aside={tiers ? `${formatCount(automatic)} refresh automatically` : null}
            title="Refresh tiers"
        >
            <DataGrid
                aria-label={label}
                className="hairline-grid"
                columns={isPhone ? phoneColumns : columns}
                data={[...(tiers ?? [])]}
                getRowId={tier => tier.key}
                renderEmptyState={() => (tiers ? 'No refresh tiers.' : 'Loading…')}
                variant="secondary"
            />
        </StatusBlock>
    );
};

const columns: DataGridColumn<RefreshTier>[] = [
    {
        cell: tier => (
            <span className="inline-flex items-center gap-1.5">
                <span className="font-mono">{tier.label}</span>
                {tier.hint ? <TierHint hint={tier.hint} /> : null}
            </span>
        ),
        header: 'BSR',
        id: 'label',
        isRowHeader: true,
    },
    {
        accessorKey: 'refreshEveryLabel',
        cellClassName: 'text-muted',
        header: 'Every',
        id: 'cadence',
    },
    {
        align: 'end',
        cell: tier => <span className="font-mono tabular-nums">{formatCount(tier.count)}</span>,
        header: 'Products',
        id: 'count',
    },
    {
        align: 'end',
        cell: tier =>
            tier.isAutoRefresh ? (
                <Chip color="success" size="sm" variant="soft">
                    Auto
                </Chip>
            ) : (
                <Chip size="sm" variant="soft">
                    Manual
                </Chip>
            ),
        header: 'Sync',
        id: 'auto',
        width: 88,
    },
];

const phoneColumns = columns.filter(column => column.id !== 'auto');

const TierHint = ({ hint }: { hint: string }) => (
    <Tooltip closeDelay={0} delay={150}>
        <Tooltip.Trigger<'span'>
            render={props => (
                <span {...props} aria-label={hint} className="status-hint" role="img" />
            )}
        >
            <Icon icon={InformationCircleIcon} size={14} />
        </Tooltip.Trigger>
        <Tooltip.Content className="max-w-64">{hint}</Tooltip.Content>
    </Tooltip>
);
