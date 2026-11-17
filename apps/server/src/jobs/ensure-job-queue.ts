import type { PgBoss, Queue } from 'pg-boss';

type QueueDefinition = {
    jobName: string;
    queueOptions: Omit<Queue, 'name'>;
    schedule?: object;
};

// pg-boss keeps an existing queue as created: `createQueue` does nothing when the name exists and
// `updateQueue` refuses a policy change. A scheduled job's queue holds only ticks its schedule
// re-sends, so when its declared policy differs from the stored one the queue is dropped and
// recreated, discarding waiting ticks and the schedule row, which the caller registers next. Entity
// queues hold real work and are never recreated here.
export const ensureJobQueue = async (boss: PgBoss, definition: QueueDefinition) => {
    const { jobName, queueOptions, schedule } = definition;
    await boss.createQueue(jobName, queueOptions);
    if (!schedule) return;
    const declared = queueOptions.policy ?? 'standard';
    const stored = (await boss.getQueue(jobName))?.policy;
    if (stored === declared) return;
    console.log(`[Jobs] Recreating ${jobName} queue: policy ${stored} -> ${declared}`);
    await boss.deleteQueue(jobName);
    await boss.createQueue(jobName, queueOptions);
    const recreated = (await boss.getQueue(jobName))?.policy;
    if (recreated !== declared)
        console.error(`[Jobs] ${jobName} queue still has policy ${recreated}, not ${declared}`);
};
