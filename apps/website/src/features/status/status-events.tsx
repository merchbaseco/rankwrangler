import { type Selection, Spinner } from '@heroui/react';
import { DataGrid } from '@heroui-pro/react';
import { useState } from 'react';
import { logColumns } from '@/features/logs/log-columns';
import { LogDetailSheet } from '@/features/logs/log-details';
import type { EventLogLevel, EventLogStatus, EventLogTypeFilter } from '@/features/logs/log-model';
import { LogToolbar } from '@/features/logs/log-toolbar';
import { useEventLogs } from '@/features/logs/use-event-logs';
import { formatCount } from './metrics/metric-format';
import { StatusSection } from './status-panel';

/**
 * Every event the server records, newest first, with the Logs page's filters. It loads older
 * events as the table scrolls and stays live; a row opens its full payload in a sheet.
 */
export const StatusEvents = () => {
    const [levels, setLevels] = useState<EventLogLevel[]>([]);
    const [statuses, setStatuses] = useState<EventLogStatus[]>([]);
    const [type, setType] = useState<EventLogTypeFilter>('all');
    const [isLive, setIsLive] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const { logs, query } = useEventLogs({ levels, search: '', statuses, type }, isLive);
    const selectedLog = selectedId ? (logs.find(log => log.id === selectedId) ?? null) : null;
    const hasFilters = levels.length > 0 || statuses.length > 0 || type !== 'all';

    const handleSelectionChange = (keys: Selection) => {
        const [first] = keys === 'all' ? [] : [...keys];
        setSelectedId(first === undefined ? null : String(first));
    };

    return (
        <StatusSection caption={`${formatCount(logs.length)} loaded`} title="Event log">
            <LogToolbar
                hasFilters={hasFilters}
                isFetching={query.isFetching && !isLive}
                isLive={isLive}
                levels={levels}
                onClear={() => {
                    setLevels([]);
                    setStatuses([]);
                    setType('all');
                }}
                onLevelsChange={setLevels}
                onLiveChange={setIsLive}
                onRefresh={() => {
                    query.refetch().catch((error: unknown) => {
                        console.error('Refreshing events failed', error);
                    });
                }}
                onStatusesChange={setStatuses}
                onTypeChange={setType}
                statuses={statuses}
                type={type}
            />
            <div className="status-events">
                <DataGrid
                    allowsColumnResize
                    aria-label="Event log"
                    className="hairline-grid hairline-grid--fill"
                    columns={logColumns}
                    data={logs}
                    getRowId={log => log.id}
                    isLoadingMore={query.isFetchingNextPage}
                    loadMoreContent={<Spinner size="sm" />}
                    onLoadMore={
                        query.hasNextPage
                            ? () => {
                                  query.fetchNextPage().catch((error: unknown) => {
                                      console.error('Loading older events failed', error);
                                  });
                              }
                            : undefined
                    }
                    onSelectionChange={handleSelectionChange}
                    renderEmptyState={() =>
                        query.isLoading ? (
                            <Spinner size="sm" />
                        ) : query.error ? (
                            'Events did not load. Refresh to try again.'
                        ) : hasFilters ? (
                            'Nothing matches these filters.'
                        ) : (
                            'No events recorded yet.'
                        )
                    }
                    scrollContainerClassName="overflow-y-auto"
                    selectedKeys={selectedId ? new Set([selectedId]) : new Set()}
                    selectionBehavior="replace"
                    selectionMode="single"
                    variant="secondary"
                />
            </div>
            <LogDetailSheet
                isOpen={selectedLog !== null}
                log={selectedLog}
                onOpenChange={open => {
                    if (!open) {
                        setSelectedId(null);
                    }
                }}
            />
        </StatusSection>
    );
};
