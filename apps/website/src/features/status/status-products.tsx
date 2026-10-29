import type { SystemStatus } from './status-model';
import { Headline, Legend, type Segment, SegmentedBar, StatusSection } from './status-panel';

/**
 * Products: how many are indexed, then the sales-history sync status of the Merch listings.
 * Every Merch listing sits in one segment: it has Keepa sales history, it is waiting for its first
 * history download, or it sits outside the automatic Keepa tiers and is synced only on demand.
 */
export const StatusProducts = ({ products }: { products: SystemStatus['products'] }) => {
    const { history } = products;
    const segments: Segment[] = [
        { key: 'history', label: 'Has sales history', tone: 'current', value: history.withHistory },
        {
            key: 'awaiting',
            label: 'Waiting for first history',
            tone: 'pending',
            value: history.awaitingFirst,
        },
        {
            key: 'untracked',
            label: 'Not tracked by Keepa',
            tone: 'idle',
            value: history.notTracked,
        },
    ];
    return (
        <StatusSection caption="Sync status of Merch Products" title="Products">
            <Headline
                figures={[
                    { label: 'Products indexed', value: products.total },
                    { label: 'Merch', value: products.merch },
                    { label: 'New · 24h', prefix: '+', value: products.new24h },
                ]}
            />
            <SegmentedBar label="Merch Products" segments={segments} />
            <Legend segments={segments} />
        </StatusSection>
    );
};
