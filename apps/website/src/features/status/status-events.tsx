import { SearchField, Spinner } from '@heroui/react';
import { Segment } from '@heroui-pro/react';
import { useState } from 'react';
import { EventLogGrid } from '@/features/logs/event-log-grid';
import { LogDetailSheet } from '@/features/logs/log-details';
import type { EventLogLevel, EventLogStatus, EventLogTypeFilter } from '@/features/logs/log-model';
import { LogToolbar } from '@/features/logs/log-toolbar';
import { useEventLogs } from '@/features/logs/use-event-logs';
import { PaneFilters } from '@/features/shell/term-pane';
import { useSearchDraft } from '@/features/shell/use-search-draft';
import { EventHistogram } from './event-histogram';
import { type EventRange, eventRangeStart, eventRanges } from './event-range';
import { formatCount } from './status-model';
import { StatusSection } from './status-panel';
import { useEventHistogram } from './use-event-histogram';

/**
 * The event log explorer: pick a time range, filter by type, level, status or text, read the
 * histogram of what happened when, then the matching events newest first. It stays live; a row
 * opens its full payload in a sheet.
 */
export const StatusEvents = () => {
    const [range, setRange] = useState<EventRange>('24h');
    const [since, setSince] = useState(() => eventRangeStart('24h', Date.now()));
    const [search, setSearch] = useState('');
    const [levels, setLevels] = useState<EventLogLevel[]>([]);
    const [statuses, setStatuses] = useState<EventLogStatus[]>([]);
    const [type, setType] = useState<EventLogTypeFilter>('all');
    const [isLive, setIsLive] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const searchDraft = useSearchDraft(search, setSearch);

    const filters = { levels, search, statuses, type };
    const { logs, query } = useEventLogs({ ...filters, since }, isLive);
    const histogram = useEventHistogram(filters, range);
    const selectedLog = selectedId ? (logs.find(log => log.id === selectedId) ?? null) : null;
    const hasFilters =
        levels.length > 0 || statuses.length > 0 || type !== 'all' || search.length > 0;

    const changeRange = (next: EventRange) => {
        setRange(next);
        setSince(eventRangeStart(next, Date.now()));
    };
    const refresh = () => {
        setSince(eventRangeStart(range, Date.now()));
        Promise.all([query.refetch(), histogram.refetch()]).catch((error: unknown) => {
            console.error('Refreshing events failed', error);
        });
    };

    return (
        <StatusSection
            caption={
                histogram.data
                    ? `${formatCount(histogram.data.total)} events · last ${range}`
                    : null
            }
            title="Event log"
        >
            <div className="status-explorer">
                <PaneFilters fill>
                    <LogToolbar
                        hasFilters={hasFilters}
                        isFetching={(query.isFetching || histogram.isFetching) && !isLive}
                        isLive={isLive}
                        leading={
                            <>
                                <Segment
                                    aria-label="Time range"
                                    onSelectionChange={key => changeRange(key as EventRange)}
                                    selectedKey={range}
                                    size="sm"
                                >
                                    {eventRanges.map(item => (
                                        <Segment.Item id={item.id} key={item.id}>
                                            {item.label}
                                        </Segment.Item>
                                    ))}
                                </Segment>
                                <SearchField
                                    aria-label="Search events"
                                    onChange={searchDraft.onChange}
                                    onFocusChange={searchDraft.onFocusChange}
                                    onSubmit={searchDraft.flush}
                                    value={searchDraft.draft}
                                    variant="secondary"
                                >
                                    <SearchField.Group>
                                        <SearchField.SearchIcon />
                                        <SearchField.Input placeholder="Search events" />
                                        <SearchField.ClearButton />
                                    </SearchField.Group>
                                </SearchField>
                            </>
                        }
                        levels={levels}
                        onClear={() => {
                            setLevels([]);
                            setStatuses([]);
                            setType('all');
                            setSearch('');
                        }}
                        onLevelsChange={setLevels}
                        onLiveChange={setIsLive}
                        onRefresh={refresh}
                        onStatusesChange={setStatuses}
                        onTypeChange={setType}
                        statuses={statuses}
                        type={type}
                    />
                </PaneFilters>
                <EventHistogram histogram={histogram.data} range={range} />
                <div className="status-events">
                    <EventLogGrid
                        hasMore={Boolean(query.hasNextPage)}
                        isLoadingMore={query.isFetchingNextPage}
                        logs={logs}
                        onLoadMore={() => {
                            query.fetchNextPage().catch((error: unknown) => {
                                console.error('Loading older events failed', error);
                            });
                        }}
                        onSelect={setSelectedId}
                        renderEmptyState={() =>
                            query.isLoading ? (
                                <Spinner size="sm" />
                            ) : query.error ? (
                                'Events did not load. Refresh to try again.'
                            ) : hasFilters ? (
                                'Nothing matches these filters.'
                            ) : (
                                'No events in this range.'
                            )
                        }
                        selectedId={selectedId}
                    />
                </div>
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
