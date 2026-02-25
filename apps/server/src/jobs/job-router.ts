import type { Job, PgBoss, SendOptions, WorkOptions } from 'pg-boss';
import { z } from 'zod';
import { logJobCompleted, logJobFailed } from '@/jobs/job-event-log.js';
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
    const intervalTimers: NodeJS.Timeout[] = [];
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
                try {
                    const result = await runTrackedJob({
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
                    });

                    await logJobCompleted({
                        jobName: jobDefinition.jobName,
                        jobId: String(queuedJob.id),
                        input: queuedJob.data,
                        result,
                    });
                } catch (error) {
                    await logJobFailed({
                        jobName: jobDefinition.jobName,
                        jobId: String(queuedJob.id),
                        input: queuedJob.data,
                        error,
                    });
                    throw error;
                }
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
            const timer = setInterval(() => {
                void boss
                    .send(
                        jobDefinition.jobName,
                        jobDefinition.schedule?.payload,
                        {
                            ...jobDefinition.sendOptions,
                            ...jobDefinition.schedule?.sendOptions,
                        }
                    )
                    .catch(error => {
                        console.error(
                            `[Jobs] Failed to enqueue interval job ${jobDefinition.jobName}:`,
                            error
                        );
                    });
            }, jobDefinition.schedule.everyMs);

            intervalTimers.push(timer);
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
        stop: async () => {
            for (const timer of intervalTimers) {
                clearInterval(timer);
            }
        },
        startupSummary: jobs.map(job => {
            return `${job.jobName} (${job.startupSummary})`;
        }),
    };
};
