import { observable } from '@trpc/server/observable';
import { adminProcedure } from '@/api/trpc';
import { type JobActivityEvent, subscribeToJobActivity } from '@/services/job-activity-events';

export const jobActivity = adminProcedure.subscription(() =>
    observable<JobActivityEvent>(emit => subscribeToJobActivity(event => emit.next(event)))
);
