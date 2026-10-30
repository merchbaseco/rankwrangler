import { Spinner } from '@heroui/react';
import { EmptyState } from '@heroui-pro/react';
import { useState } from 'react';
import { useDetailSheet } from '@/features/shell/detail-sheet';
import { ShellSearch } from '@/features/shell/shell-search';
import {
    KeyHint,
    Pane,
    PaneBar,
    PaneBarSpacer,
    PaneFilters,
    TermScreen,
} from '@/features/shell/term-pane';
import { useRowCursor } from '@/features/shell/use-row-cursor';
import { EventLogGrid } from './event-log-grid';
import { LogDetailSheet, LogDetails } from './log-details';
import type { EventLogLevel, EventLogStatus, EventLogTypeFilter } from './log-model';
import { LogRowContextMenu } from './log-row-context-menu';
import { LogToolbar } from './log-toolbar';
import { useEventLogs } from './use-event-logs';

/**
 * Logs (pane layout on the content surface, no dedicated mock): every event the server records,
 * newest first, as a dense grid. The search rides in the banner;
 * type, level and status filter from the pane bar; selecting a row (click or
 * j/k) opens its full payload in a pane beside the table.
 */
export const LogsPage = () => {
    const [search, setSearch] = useState('');
    const [levels, setLevels] = useState<EventLogLevel[]>([]);
    const [statuses, setStatuses] = useState<EventLogStatus[]>([]);
    const [type, setType] = useState<EventLogTypeFilter>('all');
    const [isLive, setIsLive] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // The shell's search pill reports the phrase once typing settles.
    const deferredSearch = search.trim();

    const { logs, query } = useEventLogs(
        { levels, search: deferredSearch, statuses, type },
        isLive
    );
    const selectedLog = selectedId ? (logs.find(log => log.id === selectedId) ?? null) : null;
    const hasFilters =
        levels.length > 0 || statuses.length > 0 || type !== 'all' || deferredSearch.length > 0;

    const clearFilters = () => {
        setLevels([]);
        setStatuses([]);
        setType('all');
        setSearch('');
    };

    // Phones show the event in a sheet; selecting a row opens it.
    const sheet = useDetailSheet();
    useRowCursor({
        attribute: 'data-log-row-id',
        ids: logs.map(log => log.id),
        onSelect: setSelectedId,
        selectedId,
    });

    const handleSelect = (id: string | null) => {
        setSelectedId(id);
        if (id !== null && sheet.isPhone) {
            sheet.open();
        }
    };

    return (
        <TermScreen>
            <ShellSearch
                label="Search events"
                onChange={setSearch}
                placeholder="Search events"
                value={search}
            />
            <h1 className="sr-only">Logs</h1>
            <div className="term-panes">
                <Pane className="log-table" label="Event log">
                    <PaneBar title="Logs">
                        <PaneFilters fill>
                            <LogToolbar
                                hasFilters={hasFilters}
                                isFetching={query.isFetching && !isLive}
                                isLive={isLive}
                                levels={levels}
                                onClear={clearFilters}
                                onLevelsChange={setLevels}
                                onLiveChange={setIsLive}
                                onRefresh={() => {
                                    query.refetch().catch((error: unknown) => {
                                        console.error('Refreshing logs failed', error);
                                    });
                                }}
                                onStatusesChange={setStatuses}
                                onTypeChange={setType}
                                statuses={statuses}
                                type={type}
                            />
                        </PaneFilters>
                    </PaneBar>
                    <LogRowContextMenu logs={logs} onShowDetails={setSelectedId}>
                        <EventLogGrid
                            hasMore={Boolean(query.hasNextPage)}
                            isLoadingMore={query.isFetchingNextPage}
                            logs={logs}
                            onLoadMore={() => {
                                query.fetchNextPage().catch((error: unknown) => {
                                    console.error('Loading older logs failed', error);
                                });
                            }}
                            onSelect={handleSelect}
                            renderEmptyState={() => (
                                <LogsEmptyState
                                    hasError={Boolean(query.error)}
                                    hasFilters={hasFilters}
                                    isLoading={query.isLoading}
                                />
                            )}
                            selectedId={selectedId}
                        />
                    </LogRowContextMenu>
                    <PaneBar edge="bottom">
                        <KeyHint keyLabel="j/k">move</KeyHint>
                        <KeyHint keyLabel="/">search</KeyHint>
                        <PaneBarSpacer />
                        <span>{logs.length.toLocaleString('en-US')} loaded</span>
                    </PaneBar>
                </Pane>
                {selectedLog && !sheet.isPhone ? (
                    <LogDetails log={selectedLog} onClose={() => setSelectedId(null)} />
                ) : null}
            </div>
            <LogDetailSheet
                isOpen={sheet.isOpen}
                log={selectedLog}
                onOpenChange={sheet.onOpenChange}
            />
        </TermScreen>
    );
};

const LogsEmptyState = ({
    hasError,
    hasFilters,
    isLoading,
}: {
    hasError: boolean;
    hasFilters: boolean;
    isLoading: boolean;
}) => {
    if (isLoading) {
        return <Spinner size="sm" />;
    }
    return (
        <EmptyState size="sm">
            <EmptyState.Header>
                <EmptyState.Title>{hasError ? 'Logs did not load' : 'No events'}</EmptyState.Title>
                <EmptyState.Description>
                    {emptyDescription(hasError, hasFilters)}
                </EmptyState.Description>
            </EmptyState.Header>
        </EmptyState>
    );
};

const emptyDescription = (hasError: boolean, hasFilters: boolean) => {
    if (hasError) {
        return 'The server did not answer. Refresh to try again.';
    }
    return hasFilters
        ? 'Nothing matches these filters.'
        : 'The server has not recorded any events yet.';
};
