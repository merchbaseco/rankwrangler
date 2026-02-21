import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { jobExecutionLogs, jobExecutions } from '@/db/schema.js';
import { getErrorMessage, toJsonValue } from '@/services/job-executions-utils.js';

type JobStatus = 'success' | 'failed';
type JobLogLevel = 'info' | 'warn' | 'error';

type JobLogEntry = {
    level: JobLogLevel;
    message: string;
    context: unknown;
    createdAt: Date;
};

type PersistJobExecutionInput = {
    jobName: string;
    status: JobStatus;
    input: unknown;
    output: unknown;
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date;
    logs: JobLogEntry[];
};

type RunTrackedJobInput<TResult> = {
    jobName: string;
    input?: unknown;
    shouldPersistSuccess?: (result: TResult) => boolean;
    run: (logger: JobLogger) => Promise<TResult>;
};

type ListRecentJobExecutionsInput = { limit: number; status?: JobStatus; jobNames?: string[] };

export type JobLogger = {
    info: (message: string, context?: unknown) => void;
    warn: (message: string, context?: unknown) => void;
    error: (message: string, context?: unknown) => void;
};

export type JobExecutionLogRecord = {
    id: string;
    level: string;
    message: string;
    context: unknown;
    createdAt: string;
};

export type JobExecutionRecord = {
    id: string;
    jobName: string;
    status: string;
    input: unknown;
    output: unknown;
    errorMessage: string | null;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    logs: JobExecutionLogRecord[];
};

export const runTrackedJob = async <TResult>({
    jobName,
    input = null,
    shouldPersistSuccess,
    run,
}: RunTrackedJobInput<TResult>) => {
    const startedAt = new Date();
    const logs: JobLogEntry[] = [];

    const logger: JobLogger = {
        info: (message, context) => {
            pushLog(logs, 'info', message, context);
            logToConsole('info', jobName, message, context);
        },
        warn: (message, context) => {
            pushLog(logs, 'warn', message, context);
            logToConsole('warn', jobName, message, context);
        },
        error: (message, context) => {
            pushLog(logs, 'error', message, context);
            logToConsole('error', jobName, message, context);
        },
    };

    try {
        const result = await run(logger);
        const finishedAt = new Date();
        const shouldPersist = shouldPersistSuccess ? shouldPersistSuccess(result) : true;

        if (!shouldPersist) {
            return result;
        }

        await persistJobExecution({
            jobName,
            status: 'success',
            input,
            output: result,
            errorMessage: null,
            startedAt,
            finishedAt,
            logs,
        });

        return result;
    } catch (error) {
        const finishedAt = new Date();
        const errorMessage = getErrorMessage(error);

        pushLog(logs, 'error', 'Unhandled job error', { error: errorMessage });
        logToConsole('error', jobName, 'Unhandled job error', { error: errorMessage });

        await persistJobExecution({
            jobName,
            status: 'failed',
            input,
            output: null,
            errorMessage,
            startedAt,
            finishedAt,
            logs,
        });

        throw error;
    }
};

export const listRecentJobExecutions = async ({
    limit,
    status,
    jobNames,
}: ListRecentJobExecutionsInput): Promise<JobExecutionRecord[]> => {
    const filter =
        status && jobNames && jobNames.length > 0
            ? and(
                  eq(jobExecutions.status, status),
                  inArray(jobExecutions.jobName, jobNames)
              )
            : status
              ? eq(jobExecutions.status, status)
              : jobNames && jobNames.length > 0
                ? inArray(jobExecutions.jobName, jobNames)
                : undefined;

    const executions = await db
        .select({
            id: jobExecutions.id,
            jobName: jobExecutions.jobName,
            status: jobExecutions.status,
            input: jobExecutions.input,
            output: jobExecutions.output,
            errorMessage: jobExecutions.errorMessage,
            startedAt: jobExecutions.startedAt,
            finishedAt: jobExecutions.finishedAt,
        })
        .from(jobExecutions)
        .where(filter)
        .orderBy(desc(jobExecutions.startedAt))
        .limit(limit);

    if (executions.length === 0) {
        return [];
    }

    const executionIds = executions.map((execution) => execution.id);

    const logs = await db
        .select({
            id: jobExecutionLogs.id,
            executionId: jobExecutionLogs.executionId,
            level: jobExecutionLogs.level,
            message: jobExecutionLogs.message,
            context: jobExecutionLogs.context,
            createdAt: jobExecutionLogs.createdAt,
        })
        .from(jobExecutionLogs)
        .where(inArray(jobExecutionLogs.executionId, executionIds))
        .orderBy(desc(jobExecutionLogs.createdAt));

    const logsByExecutionId = new Map<string, JobExecutionLogRecord[]>();

    for (const log of logs) {
        const existingLogs = logsByExecutionId.get(log.executionId) ?? [];
        existingLogs.push({
            id: log.id,
            level: log.level,
            message: log.message,
            context: log.context,
            createdAt: log.createdAt.toISOString(),
        });
        logsByExecutionId.set(log.executionId, existingLogs);
    }

    return executions.map((execution) => {
        const executionLogs = logsByExecutionId.get(execution.id) ?? [];

        return {
            id: execution.id,
            jobName: execution.jobName,
            status: execution.status,
            input: execution.input,
            output: execution.output,
            errorMessage: execution.errorMessage,
            startedAt: execution.startedAt.toISOString(),
            finishedAt: execution.finishedAt.toISOString(),
            durationMs: execution.finishedAt.getTime() - execution.startedAt.getTime(),
            logs: executionLogs.reverse(),
        };
    });
};

const persistJobExecution = async ({
    jobName,
    status,
    input,
    output,
    errorMessage,
    startedAt,
    finishedAt,
    logs,
}: PersistJobExecutionInput) => {
    const [execution] = await db
        .insert(jobExecutions)
        .values({
            jobName,
            status,
            input: toJsonValue(input),
            output: toJsonValue(output),
            errorMessage,
            startedAt,
            finishedAt,
        })
        .returning({
            id: jobExecutions.id,
        });

    if (logs.length === 0) {
        return;
    }

    await db.insert(jobExecutionLogs).values(
        logs.map((log) => ({
            executionId: execution.id,
            level: log.level,
            message: log.message,
            context: toJsonValue(log.context),
            createdAt: log.createdAt,
        }))
    );
};

const pushLog = (
    logs: JobLogEntry[],
    level: JobLogLevel,
    message: string,
    context: unknown
) => {
    logs.push({
        level,
        message,
        context: toJsonValue(context),
        createdAt: new Date(),
    });
};

const logToConsole = (
    level: JobLogLevel,
    jobName: string,
    message: string,
    context: unknown
) => {
    const prefix = `[Job][${jobName}] ${message}`;

    switch (level) {
        case 'error':
            if (context === undefined) {
                console.error(prefix);
            } else {
                console.error(prefix, context);
            }
            return;
        case 'warn':
            if (context === undefined) {
                console.warn(prefix);
            } else {
                console.warn(prefix, context);
            }
            return;
        default:
            if (context === undefined) {
                console.log(prefix);
            } else {
                console.log(prefix, context);
            }
    }
};
