import { eq, gte, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { eventLogs } from '@/db/schema';
import {
    eventLogLevels,
    eventLogPrimitiveTypes,
    eventLogStatuses,
} from '@/services/event-log-enums';

/**
 * The filters an event log read honours, shared by the list and its histogram so both always
 * describe the same events. `since` bounds the time range from below.
 */
export const eventLogFiltersSchema = z.object({
    levels: z.array(z.enum(eventLogLevels)).max(eventLogLevels.length).optional(),
    statuses: z.array(z.enum(eventLogStatuses)).max(eventLogStatuses.length).optional(),
    primitiveTypes: z
        .array(z.enum(eventLogPrimitiveTypes))
        .max(eventLogPrimitiveTypes.length)
        .optional(),
    actions: z.array(z.string().min(1)).max(25).optional(),
    asin: z.string().min(1).optional(),
    marketplaceId: z.string().min(1).optional(),
    jobRunId: z.string().min(1).optional(),
    search: z.string().min(1).max(200).optional(),
    since: z.string().datetime().optional(),
});

export type EventLogFilters = z.infer<typeof eventLogFiltersSchema>;

/** The `where` conditions for one account's events under `filters`. */
export const eventLogFilterConditions = (accountId: string, filters: EventLogFilters): SQL[] => {
    const conditions: SQL[] = [eq(eventLogs.accountId, accountId)];
    if (filters.levels && filters.levels.length > 0) {
        conditions.push(inArray(eventLogs.level, filters.levels));
    }
    if (filters.statuses && filters.statuses.length > 0) {
        conditions.push(inArray(eventLogs.status, filters.statuses));
    }
    if (filters.primitiveTypes && filters.primitiveTypes.length > 0) {
        conditions.push(inArray(eventLogs.primitiveType, filters.primitiveTypes));
    }
    if (filters.actions && filters.actions.length > 0) {
        conditions.push(inArray(eventLogs.action, filters.actions));
    }
    if (filters.asin) {
        conditions.push(eq(eventLogs.asin, filters.asin.toUpperCase()));
    }
    if (filters.marketplaceId) {
        conditions.push(eq(eventLogs.marketplaceId, filters.marketplaceId));
    }
    if (filters.jobRunId) {
        conditions.push(eq(eventLogs.jobRunId, filters.jobRunId));
    }
    if (filters.since) {
        conditions.push(gte(eventLogs.occurredAt, new Date(filters.since)));
    }
    if (filters.search) {
        conditions.push(searchCondition(filters.search.trim()));
    }
    return conditions;
};

const searchCondition = (token: string) => {
    const likePattern = `%${token}%`;
    return or(
        ilike(eventLogs.message, likePattern),
        ilike(eventLogs.action, likePattern),
        ilike(eventLogs.category, likePattern),
        ilike(eventLogs.asin, likePattern),
        eq(eventLogs.asin, token.toUpperCase()),
        eq(eventLogs.marketplaceId, token),
        eq(eventLogs.jobRunId, token),
        eq(eventLogs.requestId, token)
    ) as SQL;
};
