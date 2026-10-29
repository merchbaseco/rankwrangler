import { api, type RouterOutputs } from '@/lib/trpc';
import { eventDrivenQueryOptions } from './metrics-polling';

export type KeywordJobsStatus = RouterOutputs['api']['app']['jobs']['keywordStatus'];

/** Pause state, scan backlog and keyword queues; `useJobActivity` refreshes it, never a timer. */
export const useKeywordJobsStatus = () =>
    api.api.app.jobs.keywordStatus.useQuery(undefined, eventDrivenQueryOptions);
