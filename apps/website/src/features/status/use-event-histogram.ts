import { keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { EventLogFilters } from '@/features/logs/use-event-logs';
import { api } from '@/lib/trpc';
import type { EventRange } from './event-range';

/**
 * Event counts per bucket over `range`, under the event list's filters. Like the list it never
 * polls: while live, `activity.created` invalidates it (see `useEventLogCreated`).
 */
export const useEventHistogram = (filters: EventLogFilters, range: EventRange) => {
    const { levels, search, statuses, type } = filters;
    const input = useMemo(
        () => ({
            levels: levels.length > 0 ? [...levels] : undefined,
            primitiveTypes: type === 'all' ? undefined : [type],
            range,
            search: search.length > 0 ? search : undefined,
            statuses: statuses.length > 0 ? [...statuses] : undefined,
        }),
        [levels, range, search, statuses, type]
    );
    return api.api.app.eventLogHistogram.useQuery(input, {
        placeholderData: keepPreviousData,
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
    });
};
