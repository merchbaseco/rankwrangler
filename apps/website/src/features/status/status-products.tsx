import type { SystemStatus } from './status-model';
import { Headline, Legend, type Segment, SegmentedBar, StatusSection } from './status-panel';

/**
 * Products: how much of the catalog is indexed and how deep. Every Product sits in one segment,
 * from Merch listings with current sales history to the non-Merch Products nobody schedules.
 */
export const StatusProducts = ({ products }: { products: SystemStatus['products'] }) => {
    const { history } = products;
    const segments: Segment[] = [
        { key: 'current', label: 'History current', tone: 'current', value: history.current },
        { key: 'overdue', label: 'History overdue', tone: 'due', value: history.overdue },
        {
            key: 'awaiting',
            label: 'Awaiting first fetch',
            tone: 'pending',
            value: history.awaitingFirst,
        },
        { key: 'unscheduled', label: 'Not scheduled', tone: 'idle', value: history.notScheduled },
        {
            key: 'non-merch',
            label: 'Non-Merch',
            tone: 'faint',
            value: Math.max(products.total - products.merch, 0),
        },
    ];
    return (
        <StatusSection caption="Indexed Products by sales-history coverage" title="Products">
            <Headline
                figures={[
                    { label: 'Products indexed', value: products.total },
                    { label: 'Merch', value: products.merch },
                    { label: 'New · 24h', prefix: '+', value: products.new24h },
                ]}
            />
            <SegmentedBar label="Products" segments={segments} />
            <Legend segments={segments} />
        </StatusSection>
    );
};
