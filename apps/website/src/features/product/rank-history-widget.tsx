import { Chip, Skeleton, Spinner, Tooltip } from '@heroui/react';
import { EmptyState, Segment } from '@heroui-pro/react';
import { ChartLineData01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '@/components/ui/icon';
import type { RankPoint } from '@/features/bsr/sparkline-geometry';
import {
    type HistoryRange,
    historyRangeLabels,
    historyRanges,
    isHistoryRange,
} from './rank-history-axis';
import { RankHistoryChart } from './rank-history-chart';
import { ProductSection } from './product-section';

/**
 * The rank history section of the Product page: a section bar with the
 * category the rank is measured in, Keepa sync status and the 30d/90d/1y/All
 * range, over the halftone chart. The chart area keeps one height while the
 * history loads, while Keepa is still collecting a product with none stored
 * (it says so instead of claiming there is none), and once it draws.
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
    <ProductSection
        actions={
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
        }
        context={
            <>
                {category ? <span className="truncate">{category}</span> : null}
                <SyncStatus error={syncError} isSyncing={isSyncing} />
            </>
        }
        title="Rank history"
    >
        <div className="rank-chart-frame">
            <ChartBody isLoading={isLoading} isSyncing={isSyncing} series={series} />
        </div>
    </ProductSection>
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
        return <Skeleton className="h-full w-full rounded-none" />;
    }
    if (series.length >= 2) {
        return <RankHistoryChart height={CHART_HEIGHT} series={series} />;
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

/** The chart's drawing height in px: `--rank-chart-height`, which the frame holds in every state. */
const CHART_HEIGHT = 320;

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
