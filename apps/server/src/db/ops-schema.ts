import { sql } from 'drizzle-orm';
import {
    check,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

export const operations = pgTable(
    'operations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        type: text('type').notNull(),
        status: text('status').notNull().default('pending'),
        targetKey: text('target_key').notNull(),
        input: jsonb('input').$type<Record<string, unknown>>().notNull(),
        resource: jsonb('resource').$type<Record<string, unknown>>(),
        error: jsonb('error').$type<Record<string, unknown>>(),
        dispatchedAt: timestamp('dispatched_at', { mode: 'date' }),
        startedAt: timestamp('started_at', { mode: 'date' }),
        completedAt: timestamp('completed_at', { mode: 'date' }),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        pendingTargetUniqueIdx: uniqueIndex('operations_pending_target_unique_idx')
            .on(table.type, table.targetKey)
            .where(sql`${table.status} = 'pending'`),
        statusUpdatedAtIdx: index('operations_status_updated_at_idx').on(
            table.status,
            table.updatedAt
        ),
        catalogSearchTargetUpdatedIdx: index('operations_catalog_search_target_updated_idx')
            .on(table.targetKey, table.updatedAt, table.id)
            .where(sql`${table.type} = 'catalogSearch'`),
        statusCheck: check(
            'operations_status_check',
            sql`${table.status} in ('pending', 'completed')`
        ),
        outcomeCheck: check(
            'operations_outcome_check',
            sql`(
                (${table.status} = 'pending'
                    AND ${table.resource} IS NULL
                    AND ${table.error} IS NULL
                    AND ${table.completedAt} IS NULL)
                OR
                (${table.status} = 'completed'
                    AND ${table.completedAt} IS NOT NULL
                    AND ((${table.resource} IS NULL) <> (${table.error} IS NULL)))
            )`
        ),
    })
);

export const eventLogs = pgTable(
    'event_logs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        accountId: text('account_id').notNull().default('global'),
        occurredAt: timestamp('occurred_at', { mode: 'date' }).notNull().defaultNow(),
        level: text('level').notNull(),
        status: text('status').notNull(),
        category: text('category').notNull(),
        action: text('action').notNull(),
        primitiveType: text('primitive_type').notNull(),
        message: text('message').notNull(),
        detailsJson: jsonb('details_json').$type<Record<string, unknown>>().notNull(),
        primitiveId: text('primitive_id'),
        marketplaceId: text('marketplace_id'),
        asin: text('asin'),
        jobName: text('job_name'),
        jobRunId: text('job_run_id'),
        requestId: text('request_id'),
    },
    table => ({
        accountOccurredAtIdx: index('event_logs_account_occurred_at_idx').on(
            table.accountId,
            table.occurredAt
        ),
        accountPrimitiveOccurredAtIdx: index('event_logs_account_primitive_occurred_at_idx').on(
            table.accountId,
            table.primitiveType,
            table.occurredAt
        ),
        accountAsinOccurredAtIdx: index('event_logs_account_asin_occurred_at_idx').on(
            table.accountId,
            table.asin,
            table.occurredAt
        ),
        accountJobRunOccurredAtIdx: index('event_logs_account_job_run_occurred_at_idx').on(
            table.accountId,
            table.jobRunId,
            table.occurredAt
        ),
    })
);

export const jobExecutions = pgTable(
    'job_executions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        jobName: text('job_name').notNull(),
        status: text('status').notNull(),
        input: jsonb('input').$type<unknown>(),
        output: jsonb('output').$type<unknown>(),
        errorMessage: text('error_message'),
        startedAt: timestamp('started_at', { mode: 'date' }).notNull(),
        finishedAt: timestamp('finished_at', { mode: 'date' }).notNull(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        jobNameStartedAtIdx: index('job_executions_job_name_started_at_idx').on(
            table.jobName,
            table.startedAt
        ),
        statusStartedAtIdx: index('job_executions_status_started_at_idx').on(
            table.status,
            table.startedAt
        ),
    })
);

export const jobExecutionLogs = pgTable(
    'job_execution_logs',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        executionId: uuid('execution_id')
            .references(() => jobExecutions.id, { onDelete: 'cascade' })
            .notNull(),
        level: text('level').notNull(),
        message: text('message').notNull(),
        context: jsonb('context').$type<unknown>(),
        createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    },
    table => ({
        executionCreatedAtIdx: index('job_execution_logs_execution_created_at_idx').on(
            table.executionId,
            table.createdAt
        ),
    })
);
