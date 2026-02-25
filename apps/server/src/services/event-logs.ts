import {
    and,
    desc,
    eq,
    ilike,
    inArray,
    lt,
    or,
    type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { eventLogs } from '@/db/schema.js';

export const eventLogLevels = ['info', 'warn', 'error', 'debug'] as const;
export const eventLogStatuses = ['success', 'failed', 'pending', 'retrying', 'partial'] as const;
export const eventLogPrimitiveTypes = ['product', 'history', 'job', 'system'] as const;

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

const eventLogsListInputSchema = z.object({
    accountId: z.string().min(1).default('global'),
    limit: z.number().int().min(1).max(200).default(100),
    cursor: z
        .object({
            id: z.string().uuid(),
            occurredAt: z.string().datetime(),
        })
        .optional(),
    levels: z.array(eventLogLevelSchema).max(eventLogLevels.length).optional(),
    statuses: z.array(eventLogStatusSchema).max(eventLogStatuses.length).optional(),
    primitiveTypes: z.array(eventLogPrimitiveTypeSchema).max(eventLogPrimitiveTypes.length).optional(),
    actions: z.array(z.string().min(1)).max(25).optional(),
    asin: z.string().min(1).optional(),
    marketplaceId: z.string().min(1).optional(),
    jobRunId: z.string().min(1).optional(),
    search: z.string().min(1).max(200).optional(),
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

    const parsedInputs = inputs.map((input) => eventLogCreateInputSchema.parse(input));
    const insertedRows = await db
        .insert(eventLogs)
        .values(
            parsedInputs.map((input) => ({
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

    return insertedRows;
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
    const whereConditions: SQL[] = [eq(eventLogs.accountId, parsedInput.accountId)];
    const cursorDate = parsedInput.cursor ? new Date(parsedInput.cursor.occurredAt) : null;

    if (parsedInput.levels && parsedInput.levels.length > 0) {
        whereConditions.push(inArray(eventLogs.level, parsedInput.levels));
    }

    if (parsedInput.statuses && parsedInput.statuses.length > 0) {
        whereConditions.push(inArray(eventLogs.status, parsedInput.statuses));
    }

    if (parsedInput.primitiveTypes && parsedInput.primitiveTypes.length > 0) {
        whereConditions.push(inArray(eventLogs.primitiveType, parsedInput.primitiveTypes));
    }

    if (parsedInput.actions && parsedInput.actions.length > 0) {
        whereConditions.push(inArray(eventLogs.action, parsedInput.actions));
    }

    if (parsedInput.asin) {
        whereConditions.push(eq(eventLogs.asin, parsedInput.asin.toUpperCase()));
    }

    if (parsedInput.marketplaceId) {
        whereConditions.push(eq(eventLogs.marketplaceId, parsedInput.marketplaceId));
    }

    if (parsedInput.jobRunId) {
        whereConditions.push(eq(eventLogs.jobRunId, parsedInput.jobRunId));
    }

    if (cursorDate && !Number.isNaN(cursorDate.getTime()) && parsedInput.cursor) {
        whereConditions.push(
            or(
                lt(eventLogs.occurredAt, cursorDate),
                and(eq(eventLogs.occurredAt, cursorDate), lt(eventLogs.id, parsedInput.cursor.id))
            ) as SQL
        );
    }

    if (parsedInput.search) {
        const searchToken = parsedInput.search.trim();
        const likePattern = `%${searchToken}%`;
        const uppercaseToken = searchToken.toUpperCase();

        whereConditions.push(
            or(
                ilike(eventLogs.message, likePattern),
                ilike(eventLogs.action, likePattern),
                ilike(eventLogs.category, likePattern),
                ilike(eventLogs.asin, likePattern),
                eq(eventLogs.asin, uppercaseToken),
                eq(eventLogs.marketplaceId, searchToken),
                eq(eventLogs.jobRunId, searchToken),
                eq(eventLogs.requestId, searchToken)
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
        items: items.map((item) => ({
            ...item,
            occurredAt: item.occurredAt.toISOString(),
        })),
        nextCursor,
    };
};
