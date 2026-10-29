import { api, type RouterOutputs } from '@/lib/trpc';
import type { JobRunFilter } from './job-run-filters';
import { eventDrivenQueryOptions, metricsQueryOptions } from './metrics-polling';

export type JobExecution = RouterOutputs['api']['app']['jobExecutions'][number];

/**
 * The 100 most recent runs of one job family, optionally narrowed to an outcome. Event-driven
 * reads never poll; `useJobActivity` invalidates them when a run is recorded.
 */
export const useJobExecutions = (filter: JobRunFilter, isEventDriven: boolean) =>
    api.api.app.jobExecutions.useQuery(
        { jobNames: [...filter.jobNames], limit: 100, status: filter.status },
        isEventDriven ? eventDrivenQueryOptions : metricsQueryOptions
    );
