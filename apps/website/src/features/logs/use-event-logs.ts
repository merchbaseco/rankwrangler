import { keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/trpc';
import type { EventLogLevel, EventLogStatus, EventLogTypeFilter } from './log-model';
import { useEventLogCreated } from './use-event-log-created';

const pageSize = 100;

export interface EventLogFilters {
    readonly levels: readonly EventLogLevel[];
    readonly search: string;
    /** Only events at or after this instant (ISO); omitted reads back to the first event. */
    readonly since?: string;
    readonly statuses: readonly EventLogStatus[];
    readonly type: EventLogTypeFilter;
}

/**
 * The event log, newest first, paged by the server's cursor. It never polls:
 * while live, `activity.created` refreshes the loaded pages (coalesced to once a
 * second), so new events land at the top while a person watches.
 */
export const useEventLogs = (filters: EventLogFilters, isLive: boolean) => {
    const { levels, search, since, statuses, type } = filters;
    const input = useMemo(
        () => ({
            levels: levels.length > 0 ? [...levels] : undefined,
            limit: pageSize,
            primitiveTypes: type === 'all' ? undefined : [type],
            search: search.length > 0 ? search : undefined,
            since,
            statuses: statuses.length > 0 ? [...statuses] : undefined,
        }),
        [levels, search, since, statuses, type]
    );

    useEventLogCreated(isLive);
    const query = api.api.app.eventLogs.useInfiniteQuery(input, {
        getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
        // Keep the current rows on screen while a new filter loads, instead of flashing empty.
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
    });

    const logs = useMemo(() => query.data?.pages.flatMap(page => page.items) ?? [], [query.data]);

    return { logs, query };
};
