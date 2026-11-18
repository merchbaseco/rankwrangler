import type { PgBoss, Queue } from 'pg-boss';

type QueueDefinition = {
    jobName: string;
    queueOptions: Omit<Queue, 'name'>;
    schedule?: object;
};

const pgBossSchema = 'pgboss';

// pg-boss keeps an existing queue as created: `createQueue` does nothing when the name exists and
// `updateQueue` refuses a policy change. A scheduled job's queue holds only ticks its schedule
// re-sends, so when its declared policy differs from the stored one the queue is dropped and
// recreated, discarding waiting ticks and the schedule row, which the caller registers next. Entity
// queues hold real work and are never recreated here. A failed recreation is logged with its cause
// and leaves the queue as it was; startup continues on the old policy.
export const ensureJobQueue = async (boss: PgBoss, definition: QueueDefinition) => {
    const { jobName, schedule } = definition;
    const queueOptions = { deleteAfterSeconds: JOB_RETENTION_SECONDS, ...definition.queueOptions };
    await boss.createQueue(jobName, queueOptions);
    const current = await ensureJobRetention(boss, jobName, queueOptions.deleteAfterSeconds);
    if (!schedule) return;
    const declared = queueOptions.policy ?? 'standard';
    const stored = current?.policy;
    if (stored === declared) return;
    console.log(`[Jobs] Recreating ${jobName} queue: policy ${stored} -> ${declared}`);
    try {
        await boss
            .getDb()
            .executeSql(buildRecreateQueueSql(jobName, { ...queueOptions, policy: declared }));
    } catch (error) {
        console.error(
            `[Jobs] Could not recreate ${jobName} queue; it keeps policy ${stored}:`,
            error
        );
        return;
    }
    const recreated = (await boss.getQueue(jobName))?.policy;
    if (recreated !== declared)
        console.error(`[Jobs] ${jobName} queue still has policy ${recreated}, not ${declared}`);
};

/**
 * How long pg-boss keeps a finished job row. pg-boss defaults to seven days, which at the keyword
 * scan rate is over half a million rows that its once-a-minute monitor scans; run history lives in
 * job_executions, so a day is enough to inspect a recent failure.
 */
export const JOB_RETENTION_SECONDS = 86_400;

/**
 * Applies a retention to an existing queue: `createQueue` keeps the stored one. Each job copies its
 * queue's retention when sent, so rows sent earlier keep theirs until they expire.
 */
export const ensureJobRetention = async (
    boss: PgBoss,
    name: string,
    deleteAfterSeconds = JOB_RETENTION_SECONDS
) => {
    const queue = await boss.getQueue(name);
    if (!queue || queue.deleteAfterSeconds === deleteAfterSeconds) return queue;
    await boss.updateQueue(name, { deleteAfterSeconds });
    return { ...queue, deleteAfterSeconds };
};

// `PgBoss.deleteQueue` discards every error, so recreation runs pg-boss's own `delete_queue` and
// `create_queue` functions directly. One `DO` statement is one transaction on any connection or
// pooler: the queue is either recreated with the declared policy or left untouched, and any
// failure reaches the caller. The queue name has passed pg-boss's name check in `createQueue`.
const buildRecreateQueueSql = (name: string, options: Omit<Queue, 'name'>) => {
    const queueName = quoteLiteral(name);
    return `
        DO $recreate_queue$
        BEGIN
            PERFORM set_config('lock_timeout', '30s', true);
            PERFORM 1 FROM ${pgBossSchema}.queue
            WHERE name = ${queueName} AND policy IS DISTINCT FROM ${quoteLiteral(String(options.policy))}
            FOR UPDATE;
            IF FOUND THEN
                PERFORM ${pgBossSchema}.delete_queue(${queueName});
                PERFORM ${pgBossSchema}.create_queue(${queueName}, ${quoteLiteral(JSON.stringify(options))}::jsonb);
            END IF;
        END
        $recreate_queue$
    `;
};

const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
