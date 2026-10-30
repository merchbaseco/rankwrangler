import { notifyEventLogCreated } from '@/db/event-log-notifications';
import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { eventLogs } from '@/db/schema.js';
import {
    eventLogLevels,
    eventLogPrimitiveTypes,
    eventLogStatuses,
} from '@/services/event-log-enums.js';
import { eventLogFilterConditions, eventLogFiltersSchema } from '@/services/event-log-filters';

const eventLogLevelSchema = z.enum(eventLogLevels);
const eventLogStatusSchema = z.enum(eventLogStatuses);
const eventLogPrimitiveTypeSchema = z.enum(eventLogPrimitiveTypes);

const eventLogCreateInputSchema = z.object({
    accountId: z.string().min(1).default('global'),
    occurredAt: z.date().optional(),
    level: eventLogLevelSchema,
    status: eventLogStatusSchema,
    category: z.string().min(1),
    action: z.string().min(1),
    primitiveType: eventLogPrimitiveTypeSchema,
    message: z.string().min(1),
    detailsJson: z.record(z.string(), z.unknown()).default({}),
    primitiveId: z.string().min(1).optional(),
    marketplaceId: z.string().min(1).optional(),
    asin: z.string().min(1).optional(),
    jobName: z.string().min(1).optional(),
    jobRunId: z.string().min(1).optional(),
    requestId: z.string().min(1).optional(),
});

const eventLogsListInputSchema = eventLogFiltersSchema.extend({
    accountId: z.string().min(1).default('global'),
    limit: z.number().int().min(1).max(200).default(100),
    cursor: z
        .object({
            id: z.string().uuid(),
            occurredAt: z.string().datetime(),
        })
        .optional(),
});

export type EventLogCreateInput = z.input<typeof eventLogCreateInputSchema>;
export type EventLogListInput = z.input<typeof eventLogsListInputSchema>;

export const createEventLog = async (input: EventLogCreateInput) => {
    const [createdRow] = await createEventLogs([input]);
    return createdRow;
};

export const createEventLogs = async (inputs: EventLogCreateInput[]) => {
    if (inputs.length === 0) {
        return [];
    }

    const parsedInputs = inputs.map(input => eventLogCreateInputSchema.parse(input));
    return db.transaction(async tx => {
        const insertedRows = await tx
            .insert(eventLogs)
            .values(
                parsedInputs.map(input => ({
                    accountId: input.accountId,
                    occurredAt: input.occurredAt ?? new Date(),
                    level: input.level,
                    status: input.status,
                    category: input.category,
                    action: input.action,
                    primitiveType: input.primitiveType,
                    message: input.message,
                    detailsJson: input.detailsJson,
                    primitiveId: input.primitiveId ?? null,
                    marketplaceId: input.marketplaceId ?? null,
                    asin: input.asin ?? null,
                    jobName: input.jobName ?? null,
                    jobRunId: input.jobRunId ?? null,
                    requestId: input.requestId ?? null,
                }))
            )
            .returning({
                id: eventLogs.id,
                occurredAt: eventLogs.occurredAt,
            });

        await notifyEventLogCreated(
            tx,
            parsedInputs.map(input => input.accountId)
        );
        return insertedRows;
    });
};

export const createEventLogSafe = async (input: EventLogCreateInput) => {
    try {
        await createEventLog(input);
    } catch (error) {
        console.error('[Event Logs] Failed to write log row:', error);
    }
};

export const createEventLogsSafe = async (inputs: EventLogCreateInput[]) => {
    if (inputs.length === 0) {
        return;
    }

    try {
        await createEventLogs(inputs);
    } catch (error) {
        console.error('[Event Logs] Failed to write log rows:', error);
    }
};

export const listEventLogs = async (input: EventLogListInput) => {
    const parsedInput = eventLogsListInputSchema.parse(input);
    const whereConditions = eventLogFilterConditions(parsedInput.accountId, parsedInput);
    const cursorDate = parsedInput.cursor ? new Date(parsedInput.cursor.occurredAt) : null;
    if (cursorDate && !Number.isNaN(cursorDate.getTime()) && parsedInput.cursor) {
        whereConditions.push(
            or(
                lt(eventLogs.occurredAt, cursorDate),
                and(eq(eventLogs.occurredAt, cursorDate), lt(eventLogs.id, parsedInput.cursor.id))
            ) as SQL
        );
    }

    const rows = await db
        .select({
            id: eventLogs.id,
            occurredAt: eventLogs.occurredAt,
            level: eventLogs.level,
            status: eventLogs.status,
            category: eventLogs.category,
            action: eventLogs.action,
            primitiveType: eventLogs.primitiveType,
            message: eventLogs.message,
            detailsJson: eventLogs.detailsJson,
            primitiveId: eventLogs.primitiveId,
            marketplaceId: eventLogs.marketplaceId,
            asin: eventLogs.asin,
            jobName: eventLogs.jobName,
            jobRunId: eventLogs.jobRunId,
            requestId: eventLogs.requestId,
        })
        .from(eventLogs)
        .where(and(...whereConditions))
        .orderBy(desc(eventLogs.occurredAt), desc(eventLogs.id))
        .limit(parsedInput.limit + 1);

    const hasMore = rows.length > parsedInput.limit;
    const items = hasMore ? rows.slice(0, parsedInput.limit) : rows;
    const nextCursor = hasMore
        ? {
              id: items[items.length - 1].id,
              occurredAt: items[items.length - 1].occurredAt.toISOString(),
          }
        : null;

    return {
        items: items.map(item => ({
            ...item,
            level: eventLogLevelSchema.parse(item.level),
            status: eventLogStatusSchema.parse(item.status),
            primitiveType: eventLogPrimitiveTypeSchema.parse(item.primitiveType),
            occurredAt: item.occurredAt.toISOString(),
        })),
        nextCursor,
    };
};
