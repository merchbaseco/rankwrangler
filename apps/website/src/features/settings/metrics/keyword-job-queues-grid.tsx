import { DataGrid, type DataGridColumn, ItemCardGroup } from '@heroui-pro/react';
import { formatAge } from './metric-age';
import { formatCount, formatMetricDateTime } from './metric-format';
import type { KeywordJobsStatus } from './use-keyword-jobs-status';

type Queue = KeywordJobsStatus['queues'][number];

/** Each keyword queue's live counts and whether its provider can start a job now. */
export const KeywordJobQueuesGrid = ({ status }: { status: KeywordJobsStatus }) => {
    const columns = queueColumns(status.paused);
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Queues</ItemCardGroup.Title>
                <ItemCardGroup.Description>
                    Waiting, scheduled and running jobs per queue, with the provider’s readiness and
                    today’s calls against its daily ceiling.
                </ItemCardGroup.Description>
            </ItemCardGroup.Header>
            <DataGrid
                aria-label="Keyword job queues"
                columns={columns}
                data={[...status.queues]}
                getRowId={queue => queue.name}
                renderEmptyState={() => 'No keyword queues.'}
            />
        </ItemCardGroup>
    );
};

const mono = (value: string) => <span className="font-mono">{value}</span>;

const queueColumns = (paused: boolean): DataGridColumn<Queue>[] => [
    {
        cell: queue => (
            <span className="block truncate font-mono" data-selectable-text>
                {queue.name}
            </span>
        ),
        header: 'Queue',
        id: 'name',
        isRowHeader: true,
        minWidth: 200,
    },
    {
        cell: queue => (
            <div className="flex min-w-0 flex-col">
                <span className="truncate">
                    {queue.provider}{' '}
                    <span className="text-muted">
                        {providerState(paused, queue.providerReadyAt)}
                    </span>
                </span>
                {queue.usage ? (
                    <span className="truncate font-mono text-muted text-sm">
                        {usageLabel(queue.usage)}
                    </span>
                ) : null}
            </div>
        ),
        header: 'Provider',
        id: 'provider',
        minWidth: 220,
    },
    {
        align: 'end',
        cell: queue => mono(formatCount(queue.waiting)),
        header: 'Waiting',
        id: 'waiting',
    },
    {
        align: 'end',
        cell: queue => mono(formatCount(queue.scheduled)),
        header: 'Scheduled',
        id: 'scheduled',
    },
    {
        align: 'end',
        cell: queue => mono(formatCount(queue.running)),
        header: 'Running',
        id: 'running',
    },
    {
        align: 'end',
        cell: queue => mono(formatAge(queue.oldestWaitingAt) ?? '—'),
        header: 'Oldest waiting',
        id: 'oldestWaiting',
    },
];

const providerState = (paused: boolean, readyAt: string | null) => {
    if (paused) {
        return '· paused';
    }
    return readyAt ? `· waiting until ${formatMetricDateTime(readyAt)}` : '· ready';
};

const usageLabel = (usage: NonNullable<Queue['usage']>) => {
    const ceiling = usage.dailyLimit === null ? '' : ` of ${formatCount(usage.dailyLimit)}`;
    return `${formatCount(usage.startsToday)}${ceiling} calls today`;
};
