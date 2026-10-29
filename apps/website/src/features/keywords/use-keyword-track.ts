import { api } from '@/lib/trpc';

/**
 * Track keyword: records explicit interest so the miner schedules the term.
 * Typing in the filter never schedules work; only this does. The tracked row
 * arrives through the realtime directory patch, so nothing is refetched here.
 */
export const useKeywordTrack = () => {
    const mutation = api.api.app.keywordTrack.useMutation();
    return {
        error: mutation.error,
        isPending: mutation.isPending,
        pendingTerm: mutation.isPending ? (mutation.variables?.term ?? null) : null,
        track: (term: string) => mutation.mutate({ term }),
    };
};
