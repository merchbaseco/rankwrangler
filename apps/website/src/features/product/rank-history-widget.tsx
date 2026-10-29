import { Chip, Skeleton, Spinner, Tooltip } from '@heroui/react';
import { EmptyState, Segment } from '@heroui-pro/react';
import { ChartLineData01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import type { RankPoint } from '@/features/bsr/sparkline-geometry';
import { PaneBar, PaneBarSpacer } from '@/features/shell/term-pane';
import {
    type HistoryRange,
    historyRangeLabels,
    historyRanges,
    isHistoryRange,
} from './rank-history-axis';
import { RankHistoryChart } from './rank-history-chart';

/**
 * The rank history section of the Product pane: a pane bar with the category
 * the rank is measured in, Keepa sync status and the 30D/90D/1Y/ALL range,
 * over the chart. While
 * Keepa is still collecting a product that has no stored history the chart
 * area says so instead of claiming there is none.
 */
export const RankHistoryWidget = ({
    category,
    isLoading,
    isSyncing,
    onRangeChange,
    range,
    series,
    syncError,
}: {
    category: string | null;
    isLoading: boolean;
    isSyncing: boolean;
    onRangeChange: (range: HistoryRange) => void;
    range: HistoryRange;
    series: readonly RankPoint[];
    syncError: string | null;
}) => (
    <section aria-label="Rank history" className="pane-section">
        <PaneBar title="Rank history">
            {category ? <span className="truncate">{category}</span> : null}
            <SyncStatus error={syncError} isSyncing={isSyncing} />
            <PaneBarSpacer />
            <Segment
                aria-label="History range"
                onSelectionChange={key => {
                    if (isHistoryRange(key)) {
                        onRangeChange(key);
                    }
                }}
                selectedKey={range}
                size="sm"
            >
                {historyRanges.map(key => (
                    <Segment.Item id={key} key={key}>
                        {historyRangeLabels[key]}
                    </Segment.Item>
                ))}
            </Segment>
        </PaneBar>
        <div className="pane-section__body">
            <ChartBody isLoading={isLoading} isSyncing={isSyncing} series={series} />
        </div>
    </section>
);

const ChartBody = ({
    isLoading,
    isSyncing,
    series,
}: {
    isLoading: boolean;
    isSyncing: boolean;
    series: readonly RankPoint[];
}) => {
    if (isLoading) {
        return <Skeleton className="h-[20rem] w-full rounded-none" />;
    }
    if (series.length >= 2) {
        return <RankHistoryChart height={320} series={series} />;
    }
    return (
        <EmptyState size="sm">
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    {isSyncing ? <Spinner size="sm" /> : <Icon icon={ChartLineData01Icon} />}
                </EmptyState.Media>
                <EmptyState.Title>
                    {isSyncing ? 'Syncing history from Keepa' : 'No rank history in this range'}
                </EmptyState.Title>
                <EmptyState.Description>
                    {isSyncing
                        ? 'The chart fills in as soon as the import lands.'
                        : 'Try a longer range, or check back after the next Keepa sync.'}
                </EmptyState.Description>
            </EmptyState.Header>
        </EmptyState>
    );
};

const SyncStatus = ({ error, isSyncing }: { error: string | null; isSyncing: boolean }) => {
    if (isSyncing) {
        return (
            <Chip size="sm" variant="soft">
                <Spinner size="sm" />
                <Chip.Label className="max-md:sr-only">Syncing Keepa</Chip.Label>
            </Chip>
        );
    }
    if (error) {
        return (
            <Tooltip>
                <Tooltip.Trigger<'span'> render={props => <span {...props} />}>
                    <Chip color="danger" size="sm" variant="soft">
                        Sync failed
                    </Chip>
                </Tooltip.Trigger>
                <Tooltip.Content>{error}</Tooltip.Content>
            </Tooltip>
        );
    }
    return null;
};
