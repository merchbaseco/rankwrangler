import { hashKey, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/trpc';
import { type DirectoryInput, patchKeywordPage } from './keyword-directory-cache';
import { createKeywordDirectoryEventUpdates } from './keyword-directory-event-updates';
import { useKeywordDirectoryRows } from './use-keyword-directory-rows';

/**
 * Keeps the grid's page live: changed terms from `keyword.directory.changed` are re-read
 * (enriched, at the page's view) and patched in place. Other pages and filters are only marked
 * stale, and the sidebar counts refetch; a resync refetches the page once.
 */
export const useKeywordDirectoryChanged = (input: DirectoryInput) => {
    const utils = api.useUtils();
    const queryClient = useQueryClient();
    const readRows = useKeywordDirectoryRows();
    const updates = useRef<ReturnType<typeof createKeywordDirectoryEventUpdates> | null>(null);
    useEffect(() => {
        const directory = utils.api.app.keywordDirectory;
        const queryKey = getQueryKey(api.api.app.keywordDirectory, input, 'query');
        const listener = createKeywordDirectoryEventUpdates({
            patch: (rows, terms) => {
                if (queryClient.isFetching({ queryKey })) {
                    return false;
                }
                directory.setData(input, previous =>
                    patchKeywordPage(previous, rows, terms, input)
                );
                // Other filters' cached pages missed this change; refetch them when shown again.
                directory
                    .invalidate(undefined, {
                        predicate: query => query.queryHash !== hashKey(queryKey),
                        refetchType: 'none',
                    })
                    .catch(() => undefined);
                // Counts and KPI bands moved with the rows; the server caches them briefly.
                utils.api.app.keyword.directoryFacets.invalidate().catch(() => undefined);
                return true;
            },
            read: (terms, view) => readRows({ terms, view }),
            reconcile: () => directory.invalidate(input),
            view: () => directory.getData(input)?.view,
        });
        updates.current = listener;
        return () => {
            listener.dispose();
            updates.current = null;
        };
    }, [input, utils, queryClient, readRows]);
    api.api.app.keyword.directory.changed.useSubscription(undefined, {
        onData: event => updates.current?.onData(event),
    });
};
