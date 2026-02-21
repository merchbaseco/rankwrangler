import type { SendOptions } from 'pg-boss';
import type { JobLogger } from '@/services/job-executions.js';

export type JobLogLevel = 'info' | 'warn' | 'error';

export type JobLogFn = (
    message: string,
    context?: unknown,
    level?: JobLogLevel
) => void;

type JobSchedule =
    | {
          type: 'interval';
          everyMs: number;
          payload: unknown;
          sendOptions?: SendOptions;
      }
    | {
          type: 'cron';
          cron: string;
          payload: unknown;
          scheduleOptions?: SendOptions;
      };

export const createJobLog = (logger: JobLogger): JobLogFn => {
    return (message, context, level = 'info') => {
        if (level === 'warn') {
            logger.warn(message, context);
            return;
        }

        if (level === 'error') {
            logger.error(message, context);
            return;
        }

        logger.info(message, context);
    };
};

export const buildStartupSummary = (
    schedule: JobSchedule | undefined,
    sendOptions: SendOptions
) => {
    if (!schedule) {
        return 'triggered manually';
    }

    if (schedule.type === 'cron') {
        return `cron: ${schedule.cron}`;
    }

    const intervalLabel = `interval: ${formatInterval(schedule.everyMs)}`;
    const singletonKey =
        schedule.sendOptions?.singletonKey ?? sendOptions.singletonKey;

    if (typeof singletonKey === 'string' && singletonKey.length > 0) {
        return `${intervalLabel}, singleton`;
    }

    return intervalLabel;
};

export const getDidWorkResult = (result: unknown) => {
    if (!isRecord(result)) {
        return true;
    }

    if (typeof result.didWork !== 'boolean') {
        return true;
    }

    return result.didWork;
};

const formatInterval = (everyMs: number) => {
    if (everyMs % (60 * 60 * 1000) === 0) {
        return `${everyMs / (60 * 60 * 1000)}h`;
    }

    if (everyMs % (60 * 1000) === 0) {
        return `${everyMs / (60 * 1000)}m`;
    }

    if (everyMs % 1000 === 0) {
        return `${everyMs / 1000}s`;
    }

    return `${everyMs}ms`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};
