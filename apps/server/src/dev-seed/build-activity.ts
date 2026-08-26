import { eventLogLevels, eventLogStatuses } from '@/services/event-log-enums';
import { DAY_MS, HOUR_MS, MINUTE_MS, shiftMs } from '@/dev-seed/time-offsets';
import type { BuilderContext, DevSeedPlan, PlanRows, SeedProduct } from '@/dev-seed/types';

/**
 * The observability surfaces: the customer-visible activity stream, background
 * job executions with their logs, and short-lived Provider telemetry.
 *
 * These three are separate stores on purpose, and the seed keeps them separate:
 * an activity event is domain history, a job execution is background work, and
 * a Provider attempt is one outbound request. They are generated from the same
 * week so the Logs page reads coherently across all three, but no row is
 * duplicated between them.
 *
 * Every level and status the Logs filters offer appears at least once, so an
 * empty filter result means a bug rather than thin data. Primitive types are
 * not rotated the same way: each event template owns the one its action really
 * carries, because an event whose action is `product.sync` but whose primitive
 * type says `job` is not data the product can produce. That leaves `system`
 * unrepresented, which is correct — nothing in RankWrangler writes it.
 */

const EVENT_TEMPLATES = [
    {
        action: 'product.sync',
        category: 'product',
        primitiveType: 'product',
        message: 'Synced Product from SP-API',
    },
    {
        action: 'history.sync.background',
        category: 'history',
        primitiveType: 'history',
        message: 'Loaded Keepa history in the background',
    },
    {
        action: 'history.sync.manual',
        category: 'history',
        primitiveType: 'history',
        message: 'Loaded Keepa history on request',
    },
    {
        action: 'product.facets.classify',
        category: 'product',
        primitiveType: 'product',
        message: 'Classified Product facets',
    },
    {
        action: 'job.fatal',
        category: 'job',
        primitiveType: 'job',
        message: 'Background job stopped with an unrecoverable error',
    },
] as const;

const JOB_NAMES = [
    'process-spapi-sync-queue',
    'process-keepa-history-refresh-queue',
    'enqueue-scheduled-keepa-history-refresh',
    'process-product-facet-classification',
    'reprocess-stale-products',
] as const;

const PROVIDER_OPERATIONS = [
    { provider: 'keepa', operation: 'keepa.product' },
    { provider: 'keepa', operation: 'keepa.catalog.search' },
    { provider: 'keepa', operation: 'keepa.token' },
    { provider: 'spapi', operation: 'spapi.catalog.search' },
    { provider: 'spapi', operation: 'spapi.reports.get' },
    { provider: 'spapi', operation: 'spapi.lwa.token' },
] as const;

const EVENTS_PER_DAY = 18;
const JOB_RUNS_PER_DAY = 4;
const PROVIDER_ATTEMPTS_PER_DAY = 9;
const JOB_FAILURE_RATE = 0.12;
const PROVIDER_ERROR_RATE = 0.09;

export interface ActivityBuild {
    readonly eventLogs: DevSeedPlan['eventLogs'];
    readonly jobExecutions: DevSeedPlan['jobExecutions'];
    readonly jobExecutionLogs: DevSeedPlan['jobExecutionLogs'];
    readonly providerAttempts: DevSeedPlan['providerAttempts'];
}

export const buildActivity = (
    context: BuilderContext,
    seedProducts: readonly SeedProduct[]
): ActivityBuild => {
    const { random, now, marketplaceId, mintId, options } = context;
    const eventLogs: PlanRows<'eventLogs'> = [];
    const jobExecutions: PlanRows<'jobExecutions'> = [];
    const jobExecutionLogs: PlanRows<'jobExecutionLogs'> = [];
    const providerAttempts: PlanRows<'providerAttempts'> = [];

    for (let day = 0; day < options.dayCount; day += 1) {
        for (let index = 0; index < EVENTS_PER_DAY; index += 1) {
            const template = random.pick(EVENT_TEMPLATES);
            const product = random.pick(seedProducts);
            const occurredAt = withinDay(context, day);
            const status = coverAll(eventLogStatuses, day * EVENTS_PER_DAY + index, context, [
                'success',
                'success',
                'success',
                'failed',
            ] as const);
            const primitiveType = template.primitiveType;
            const jobRunId = `dev-seed-run-${day}-${Math.floor(index / 4)}`;

            eventLogs.push({
                id: mintId('eventLog'),
                accountId: 'global',
                occurredAt,
                level: levelForStatus(context, status, day * EVENTS_PER_DAY + index),
                status,
                category: template.category,
                action: template.action,
                primitiveType,
                message: template.message,
                detailsJson: {
                    durationMs: random.int(120, 9000),
                    source: template.category === 'history' ? 'keepa' : 'spapi',
                },
                primitiveId: primitiveType === 'job' ? jobRunId : product.id,
                marketplaceId,
                asin: primitiveType === 'job' ? null : product.asin,
                jobName: random.pick(JOB_NAMES),
                jobRunId,
                requestId: `dev-seed-req-${day}-${index}`,
            });
        }

        for (let index = 0; index < JOB_RUNS_PER_DAY; index += 1) {
            const jobName = random.pick(JOB_NAMES);
            const startedAt = withinDay(context, day);
            const finishedAt = shiftMs(startedAt, random.int(400, 42_000));
            const failed = random.chance(JOB_FAILURE_RATE);
            const executionId = mintId('jobExecution');

            jobExecutions.push({
                id: executionId,
                jobName,
                status: failed ? 'failed' : 'success',
                input: { batchSize: random.int(5, 40) },
                output: failed ? null : { processed: random.int(0, 40), skipped: random.int(0, 6) },
                errorMessage: failed ? 'Provider request failed after 3 attempts.' : null,
                startedAt,
                finishedAt,
                createdAt: finishedAt,
            });

            jobExecutionLogs.push({
                id: mintId('jobExecutionLog'),
                executionId,
                level: 'info',
                message: `Starting ${jobName}`,
                context: { batchSize: random.int(5, 40) },
                createdAt: startedAt,
            });
            jobExecutionLogs.push({
                id: mintId('jobExecutionLog'),
                executionId,
                level: failed ? 'error' : 'info',
                message: failed ? 'Aborting after repeated provider failures' : 'Finished cleanly',
                context: { durationMs: finishedAt.getTime() - startedAt.getTime() },
                createdAt: finishedAt,
            });
        }

        for (let index = 0; index < PROVIDER_ATTEMPTS_PER_DAY; index += 1) {
            const target = random.pick(PROVIDER_OPERATIONS);
            const isError = random.chance(PROVIDER_ERROR_RATE);
            providerAttempts.push({
                id: mintId('providerAttempt'),
                provider: target.provider,
                operation: target.operation,
                attemptedAt: withinDay(context, day),
                statusCode: isError ? random.pick([429, 500, 503]) : 200,
                isError,
                latencyMs: isError ? random.int(900, 12_000) : random.int(60, 1800),
            });
        }
    }

    return { eventLogs, jobExecutionLogs, jobExecutions, providerAttempts };
};

/** A random instant inside the given whole day before `now`. */
const withinDay = (context: BuilderContext, day: number) =>
    shiftMs(context.now, -day * DAY_MS - context.random.between(0, 23 * HOUR_MS + 59 * MINUTE_MS));

/**
 * Rotates deterministically through every enum value for the first pass, then
 * falls back to a weighted pick. Guarantees each filter option has rows without
 * making the stream look mechanically uniform.
 */
const coverAll = <T>(
    values: readonly T[],
    ordinal: number,
    context: BuilderContext,
    weighted: readonly T[]
): T => (ordinal < values.length ? (values[ordinal] as T) : context.random.pick(weighted));

const levelForStatus = (
    context: BuilderContext,
    status: (typeof eventLogStatuses)[number],
    ordinal: number
) => {
    if (ordinal < eventLogLevels.length) {
        return eventLogLevels[ordinal];
    }
    if (status === 'failed') {
        return 'error';
    }
    if (status === 'retrying' || status === 'partial') {
        return 'warn';
    }
    return context.random.chance(0.08) ? 'debug' : 'info';
};
