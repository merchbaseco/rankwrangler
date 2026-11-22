import { formatRelativeTime } from '@/lib/utils';
import { formatCount, formatPercent, fraction, type SystemStatus } from './status-model';
import {
    Headline,
    Legend,
    type Segment,
    SegmentedBar,
    StatusBlock,
    StatusCard,
    StatusSection,
} from './status-panel';

/**
 * Products: how many are indexed, how active Merch listings divide between automatic tracking
 * (`<1M` BSR), on-demand (`≥1M`), and listings with no BSR, then sales-history coverage zoomed
 * into the `<1M` auto-tracked set.
 */
export const StatusProducts = ({ status }: { status: SystemStatus }) => {
    const { products } = status;
    if (!products) {
        return (
            <StatusSection caption="Not counted yet" title="Products">
                <p className="text-muted">The first count runs shortly after the server starts.</p>
            </StatusSection>
        );
    }
    const { breakdown, history } = products;
    const isPaused = status.keepa.admission?.state === 'paused';
    const catalogSegments: Segment[] = [
        {
            key: 'auto',
            label: 'Auto-tracked (<1M)',
            tone: 'current',
            value: breakdown.autoTracked,
        },
        {
            key: 'on-demand',
            label: 'On demand (≥1M)',
            tone: 'idle',
            value: breakdown.onDemand,
        },
        {
            key: 'no-bsr',
            label: 'No BSR',
            tone: 'faint',
            value: breakdown.noBsr,
        },
    ];
    const historySegments: Segment[] =
        isPaused && history.awaitingAdmission > 0
            ? [
                  {
                      key: 'synced',
                      label: 'Has history',
                      tone: 'current',
                      value: history.autoSynced,
                  },
                  {
                      key: 'pending',
                      label: 'Pending',
                      tone: 'pending',
                      value: history.awaitingFirst,
                  },
                  {
                      key: 'paused',
                      label: 'Paused',
                      tone: 'alert',
                      value: history.awaitingAdmission,
                  },
              ]
            : [
                  {
                      key: 'synced',
                      label: 'Has history',
                      tone: 'current',
                      value: history.autoSynced,
                  },
                  {
                      key: 'pending',
                      label: 'Pending',
                      tone: 'pending',
                      value: history.awaitingFirst + history.awaitingAdmission,
                  },
              ];
    const syncedShare = formatPercent(fraction(history.autoSynced, breakdown.autoTracked));

    return (
        <StatusSection
            caption={`Sync status of Merch Products · counted ${formatRelativeTime(status.countedAt)}`}
            title="Products"
        >
            <StatusCard>
                <Headline
                    figures={[
                        { label: 'Products indexed', value: products.total },
                        { label: 'Merch', value: products.merch },
                        { label: 'New · 24h', prefix: '+', value: products.new24h },
                    ]}
                />
                <StatusBlock
                    aside={`${formatCount(products.merch)} active Merch`}
                    title="Catalog breakdown"
                >
                    <SegmentedBar label="Merch catalog breakdown" segments={catalogSegments} />
                    <Legend segments={catalogSegments} showShare />
                </StatusBlock>
                <StatusBlock
                    aside={`${syncedShare} synced · ${formatCount(history.withHistory)} total with history`}
                    title="Sales history · <1M BSR"
                >
                    <SegmentedBar
                        label="Auto-tracked sales history coverage"
                        segments={historySegments}
                    />
                    <Legend segments={historySegments} showShare />
                </StatusBlock>
            </StatusCard>
        </StatusSection>
    );
};
