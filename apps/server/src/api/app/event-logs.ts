import { z } from 'zod';
import { appProcedure } from '@/api/trpc.js';
import {
    eventLogLevels,
    eventLogPrimitiveTypes,
    eventLogStatuses,
    listEventLogs,
} from '@/services/event-logs.js';

const eventLogsInput = z.object({
    limit: z.number().int().min(1).max(200).default(100),
    cursor: z
        .object({
            id: z.string().uuid(),
            occurredAt: z.string().datetime(),
        })
        .optional(),
    levels: z.array(z.enum(eventLogLevels)).optional(),
    statuses: z.array(z.enum(eventLogStatuses)).optional(),
    primitiveTypes: z.array(z.enum(eventLogPrimitiveTypes)).optional(),
    actions: z.array(z.string().min(1)).max(25).optional(),
    asin: z.string().min(1).optional(),
    marketplaceId: z.string().min(1).optional(),
    jobRunId: z.string().min(1).optional(),
    search: z.string().min(1).max(200).optional(),
});

export const eventLogsList = appProcedure
    .input(eventLogsInput.optional())
    .query(async ({ input }) => {
        return listEventLogs({
            accountId: 'global',
            limit: input?.limit ?? 100,
            cursor: input?.cursor,
            levels: input?.levels,
            statuses: input?.statuses,
            primitiveTypes: input?.primitiveTypes,
            actions: input?.actions,
            asin: input?.asin,
            marketplaceId: input?.marketplaceId,
            jobRunId: input?.jobRunId,
            search: input?.search,
        });
    });
