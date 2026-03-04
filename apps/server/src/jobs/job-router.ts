import type { Job, PgBoss, SendOptions, WorkOptions } from 'pg-boss';
import { z } from 'zod';
import { runTrackedJob } from '@/services/job-executions.js';
import {
    buildStartupSummary,
    createJobLog,
    getDidWorkResult,
    type JobLogFn,
} from '@/jobs/job-runtime-utils.js';

type JobWorkContext = {
    boss: PgBoss;
};

type JobWorkFn<TInput, TResult> = (
    job: Job<TInput>,
    signal: AbortSignal,
    log: JobLogFn,
    context: JobWorkContext
) => Promise<TResult>;

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

type AnyJobDefinition = {
    jobName: string;
    startupSummary: string;
    parseInput: (input: unknown) => unknown;
    sendOptions: SendOptions;
    workOptions?: WorkOptions;
    schedule?: JobSchedule;
    persistSuccess: 'always' | 'didWork';
    work: JobWorkFn<unknown, unknown>;
};

export type StartRegisteredJobsResult = {
    stop: () => Promise<void>;
    startupSummary: string[];
};

const registeredJobsByName = new Map<string, AnyJobDefinition>();
let hasStartedJobsRuntime = false;

class JobBuilder<TInput = unknown> {
    private inputSchema: z.ZodType<TInput> = z.unknown() as z.ZodType<TInput>;
    private sendOptions: SendOptions = {};
    private workerOptions?: WorkOptions;
    private schedule?: JobSchedule;
    private readonly jobName: string;
    private readonly startupSummary?: string;
    private readonly persistSuccess: 'always' | 'didWork';

    constructor(
        jobName: string,
        options?: {
            startupSummary?: string;
            persistSuccess?: 'always' | 'didWork';
        }
    ) {
        this.jobName = jobName;
        this.startupSummary = options?.startupSummary;
        this.persistSuccess = options?.persistSuccess ?? 'always';
    }

    input<TNextInput>(schema: z.ZodType<TNextInput>) {
        this.inputSchema = schema as unknown as z.ZodType<TInput>;
        return this as unknown as JobBuilder<TNextInput>;
    }

    options(options: SendOptions) {
        this.sendOptions = { ...this.sendOptions, ...options };
        return this;
    }

    workOptions(options: WorkOptions) {
        this.workerOptions = options;
        return this;
    }

    interval({
        everyMs,
        payload = {},
        sendOptions,
    }: {
        everyMs: number;
        payload?: unknown;
        sendOptions?: SendOptions;
    }) {
        this.schedule = {
            type: 'interval',
            everyMs,
            payload,
            sendOptions,
        };
        return this;
    }

    cron({
        cron,
        payload = {},
        scheduleOptions,
    }: {
        cron: string;
        payload?: unknown;
        scheduleOptions?: SendOptions;
    }) {
        this.schedule = {
            type: 'cron',
            cron,
            payload,
            scheduleOptions,
        };
        return this;
    }

    work<TResult>(workFn: JobWorkFn<TInput, TResult>) {
        const definition: AnyJobDefinition = {
            jobName: this.jobName,
            startupSummary:
                this.startupSummary ?? buildStartupSummary(this.schedule, this.sendOptions),
            parseInput: value => this.inputSchema.parse(value),
            sendOptions: this.sendOptions,
            workOptions: this.workerOptions,
            schedule: this.schedule,
            persistSuccess: this.persistSuccess,
            work: workFn as JobWorkFn<unknown, unknown>,
        };

        const existingDefinition = registeredJobsByName.get(this.jobName);
        if (existingDefinition && existingDefinition !== definition) {
            throw new Error(`Job already registered: ${this.jobName}`);
        }

        registeredJobsByName.set(this.jobName, definition);
        return definition;
    }
}

export const defineJob = (
    jobName: string,
    options?: {
        startupSummary?: string;
        persistSuccess?: 'always' | 'didWork';
    }
) => {
    return new JobBuilder(jobName, options);
};

export const startRegisteredJobs = async (
    boss: PgBoss
): Promise<StartRegisteredJobsResult> => {
    if (hasStartedJobsRuntime) {
        throw new Error(
            '[Jobs] startRegisteredJobs() can only be called once per process.'
        );
    }

    const jobs = Array.from(registeredJobsByName.values());
    const createdQueues = new Set<string>();

    for (const jobDefinition of jobs) {
        if (createdQueues.has(jobDefinition.jobName)) {
            continue;
        }

        await boss.createQueue(jobDefinition.jobName);
        createdQueues.add(jobDefinition.jobName);
    }

    for (const jobDefinition of jobs) {
        const worker = async (incomingJobs: Job<unknown> | Job<unknown>[]) => {
            const queuedJobs = Array.isArray(incomingJobs)
                ? incomingJobs
                : [incomingJobs];

            for (const queuedJob of queuedJobs) {
                await runTrackedJob({
                    jobName: jobDefinition.jobName,
                    input: queuedJob.data,
                    shouldPersistSuccess: result => {
                        if (jobDefinition.persistSuccess === 'always') {
                            return true;
                        }

                        return getDidWorkResult(result);
                    },
                    run: async logger => {
                        const parsedInput = jobDefinition.parseInput(queuedJob.data);
                        const typedJob = {
                            ...queuedJob,
                            data: parsedInput,
                        } as Job<unknown>;
                        const signal = new AbortController().signal;
                        const log = createJobLog(logger);

                        return jobDefinition.work(typedJob, signal, log, { boss });
                    },
                }).catch(() => {
                    // Intentionally swallow worker errors after runTrackedJob persists failure details.
                    // Queue-level retries are controlled per job via explicit follow-up scheduling.
                    return undefined;
                });
            }
        };

        if (jobDefinition.workOptions) {
            await boss.work(
                jobDefinition.jobName,
                jobDefinition.workOptions,
                worker
            );
        } else {
            await boss.work(jobDefinition.jobName, worker);
        }

        if (!jobDefinition.schedule) {
            continue;
        }

        if (jobDefinition.schedule.type === 'interval') {
            const cron = intervalMsToCronExpression(jobDefinition.schedule.everyMs);
            await boss.schedule(
                jobDefinition.jobName,
                cron,
                jobDefinition.schedule.payload,
                {
                    ...jobDefinition.sendOptions,
                    ...jobDefinition.schedule.sendOptions,
                }
            );
            continue;
        }

        await boss.schedule(
            jobDefinition.jobName,
            jobDefinition.schedule.cron,
            jobDefinition.schedule.payload,
            {
                ...jobDefinition.sendOptions,
                ...jobDefinition.schedule.scheduleOptions,
            }
        );
    }

    hasStartedJobsRuntime = true;

    return {
        stop: async () => {},
        startupSummary: jobs.map(job => {
            return `${job.jobName} (${job.startupSummary})`;
        }),
    };
};

export const intervalMsToCronExpression = (everyMs: number) => {
    if (!Number.isFinite(everyMs) || everyMs <= 0 || everyMs % (60 * 1000) !== 0) {
        throw new Error(
            `[Jobs] Unsupported interval ${everyMs}ms. Interval scheduling must be in whole minutes.`
        );
    }

    const everyMinutes = everyMs / (60 * 1000);

    if (everyMinutes === 1) {
        return '* * * * *';
    }

    if (everyMinutes < 60 && 60 % everyMinutes === 0) {
        return `*/${everyMinutes} * * * *`;
    }

    if (everyMinutes === 60) {
        return '0 * * * *';
    }

    if (everyMinutes < 24 * 60 && everyMinutes % 60 === 0) {
        const everyHours = everyMinutes / 60;
        if (24 % everyHours === 0) {
            return `0 */${everyHours} * * *`;
        }
    }

    if (everyMinutes === 24 * 60) {
        return '0 0 * * *';
    }

    throw new Error(
        `[Jobs] Unsupported interval ${everyMs}ms. Use .cron() for non-hourly/minute-compatible schedules.`
    );
};
