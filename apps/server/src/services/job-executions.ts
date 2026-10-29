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

export type JobLogger = {
    info: (message: string, context?: unknown) => void;
    warn: (message: string, context?: unknown) => void;
    error: (message: string, context?: unknown) => void;
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

        // A finished job stays finished if its history row cannot be written.
        await persistJobExecution({
            jobName,
            status: 'success',
            input,
            output: result,
            errorMessage: null,
            startedAt,
            finishedAt,
            logs,
        }).catch(error => {
            console.error(`[Jobs] Could not record ${jobName} run`, error);
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

    if (logs.length > 0)
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
