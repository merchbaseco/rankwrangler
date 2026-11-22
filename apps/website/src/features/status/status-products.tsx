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
 * Products: active Merch count, 24h growth, auto-tracked `<1M` BSR slice, and sales-history
 * coverage zoomed into that `<1M` set. Full BSR tier counts live in the provider cards below.
 */
export const StatusProducts = ({ status }: { status: SystemStatus }) => {
    const { products } = status;
    if (!products) {
        return (
            <StatusSection caption="Not counted yet" title="Products">
                <StatusCard>
                    <p className="text-muted">
                        The first count runs shortly after the server starts.
                    </p>
                </StatusCard>
            </StatusSection>
        );
    }
    const { breakdown, history } = products;
    const isPaused = status.keepa.admission?.state === 'paused';
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
            caption={`${formatCount(products.total)} indexed · counted ${formatRelativeTime(status.countedAt)}`}
            title="Products"
        >
            <StatusCard>
                <Headline
                    figures={[
                        { label: 'Merch', value: products.merch },
                        { label: 'New · 24h', prefix: '+', value: products.new24h },
                        { label: 'Auto-tracked', value: breakdown.autoTracked },
                    ]}
                />
                <StatusBlock
                    aside={`${syncedShare} synced · ${formatCount(history.withHistory)} total`}
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
