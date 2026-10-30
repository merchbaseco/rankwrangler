import { z } from 'zod';
import { appProcedure } from '@/api/trpc';
import { eventLogFiltersSchema } from '@/services/event-log-filters';
import { listEventLogs } from '@/services/event-logs';

const eventLogsInput = eventLogFiltersSchema.extend({
    limit: z.number().int().min(1).max(200).default(100),
    cursor: z
        .object({
            id: z.string().uuid(),
            occurredAt: z.string().datetime(),
        })
        .optional(),
});

/** Events newest first, one cursor page at a time, under the shared event log filters. */
export const eventLogsList = appProcedure
    .input(eventLogsInput.optional())
    .query(({ input }) => listEventLogs({ ...input, accountId: 'global' }));
