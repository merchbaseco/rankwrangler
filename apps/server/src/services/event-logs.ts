import { notifyEventLogCreated } from '@/db/event-log-notifications';
import { and, desc, eq, lt, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { eventLogs } from '@/db/schema.js';
import {
    eventLogLevels,
    eventLogPrimitiveTypes,
    eventLogStatuses,
} from '@/services/event-log-enums.js';
import {
    eventLogFiltersSchema,
    eventLogIndexedConditions,
    eventLogScanConditions,
} from '@/services/event-log-filters';

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

/** Rows a page examines at most when a filter no index answers is set; see listEventLogs. */
export const EVENT_LOG_SCAN_ROWS = 10_000;

/**
 * Events newest first, one cursor page at a time. Account, time floor, type, ASIN and job run walk
 * an `(account_id, X, occurred_at)` index. Level, status, action, marketplace and free-text
 * filters are checked row by row over at most EVENT_LOG_SCAN_ROWS of those rows, so a rare match
 * never walks the whole table: when the scan ends before the page fills, the page holds what it
 * found and `nextCursor` continues from the last row examined.
 */
export const listEventLogs = async (input: EventLogListInput) => {
    const parsedInput = eventLogsListInputSchema.parse(input);
    const indexed = eventLogIndexedConditions(parsedInput.accountId, parsedInput);
    const cursorDate = parsedInput.cursor ? new Date(parsedInput.cursor.occurredAt) : null;
    if (cursorDate && !Number.isNaN(cursorDate.getTime()) && parsedInput.cursor) {
        indexed.push(
            or(
                lt(eventLogs.occurredAt, cursorDate),
                and(eq(eventLogs.occurredAt, cursorDate), lt(eventLogs.id, parsedInput.cursor.id))
            ) as SQL
        );
    }
    const scan = eventLogScanConditions(parsedInput);
    const limit = parsedInput.limit;
    const rows = scan.length
        ? await readScannedPage(indexed, scan, limit)
        : (
              await db
                  .select(listColumns)
                  .from(eventLogs)
                  .where(and(...indexed))
                  .orderBy(desc(eventLogs.occurredAt), desc(eventLogs.id))
                  .limit(limit + 1)
          ).map(row => ({ ...row, matches: true, edge: false }));
    const matched = rows.filter(row => row.matches);
    const items = matched.slice(0, limit);
    const edge = rows.find(row => row.edge);
    const continueFrom = matched.length > limit ? items[items.length - 1] : edge;
    return {
        items: items.map(({ matches: _matches, edge: _edge, ...item }) => ({
            ...item,
            level: eventLogLevelSchema.parse(item.level),
            status: eventLogStatusSchema.parse(item.status),
            primitiveType: eventLogPrimitiveTypeSchema.parse(item.primitiveType),
            occurredAt: item.occurredAt.toISOString(),
        })),
        nextCursor: continueFrom
            ? { id: continueFrom.id, occurredAt: continueFrom.occurredAt.toISOString() }
            : null,
    };
};

const listColumns = {
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
};

/**
 * One statement: the newest EVENT_LOG_SCAN_ROWS rows the index selects, numbered as they are
 * read, then the matching ones plus the last row examined when the scan used its whole budget
 * (the `edge` a short page continues from). The edge is the oldest scanned row, so it can only
 * follow the matches and never displaces one from the page.
 */
const readScannedPage = async (indexed: SQL[], scan: SQL[], limit: number) => {
    const scanned = db.$with('scanned').as(
        db
            .select({
                ...listColumns,
                matches: sql<boolean>`(${and(...scan)})`.as('matches'),
                position: sql<number>`row_number() over (
                    order by ${eventLogs.occurredAt} desc, ${eventLogs.id} desc)`.as('position'),
            })
            .from(eventLogs)
            .where(and(...indexed))
            .orderBy(desc(eventLogs.occurredAt), desc(eventLogs.id))
            .limit(EVENT_LOG_SCAN_ROWS)
    );
    const rows = await db
        .with(scanned)
        .select()
        .from(scanned)
        .where(or(sql`${scanned.matches}`, eq(scanned.position, EVENT_LOG_SCAN_ROWS)))
        .orderBy(desc(scanned.occurredAt), desc(scanned.id))
        .limit(limit + 2);
    return rows.map(({ position, ...row }) => ({
        ...row,
        edge: Number(position) === EVENT_LOG_SCAN_ROWS,
    }));
};
