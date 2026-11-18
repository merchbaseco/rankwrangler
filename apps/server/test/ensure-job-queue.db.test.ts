import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { PgBoss } from 'pg-boss';
import { buildDatabaseUrl } from '@/config/database-url';
import { countQueuedJobs } from '@/db/job-queue-status';
import { ensureJobQueue, JOB_RETENTION_SECONDS } from '@/jobs/ensure-job-queue';

const tick = 'ensure-queue-test-tick';
const holder = 'ensure-queue-test-holder';
const entity = 'ensure-queue-test-entity';

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('ensureJobQueue', () => {
    let boss: PgBoss;
    beforeEach(async () => {
        boss = new PgBoss({ connectionString: buildDatabaseUrl() });
        boss.on('error', error => console.error('[pg-boss] Error:', error));
        await boss.start();
        await dropTestQueues(boss);
    });
    afterEach(async () => {
        await dropTestQueues(boss);
        await boss.stop({ graceful: false });
    });

    it('recreates a scheduled singleton queue as exclusive and drops its stale ticks', async () => {
        await seedSingletonTicks(boss, tick);
        const errors = spyOn(console, 'error');
        try {
            await ensureJobQueue(boss, {
                jobName: tick,
                queueOptions: { policy: 'exclusive' },
                schedule: {},
            });
            expect(errors).not.toHaveBeenCalled();
        } finally {
            errors.mockRestore();
        }
        expect((await boss.getQueue(tick))?.policy).toBe('exclusive');
        expect(await countJobs(boss, tick)).toBe(0);
        expect(await boss.getSchedules(tick)).toHaveLength(0);
    });

    it('logs the real cause and keeps the old queue when recreation fails', async () => {
        await seedSingletonTicks(boss, tick);
        // A dead-letter reference makes pg-boss refuse to delete the queue.
        await boss.createQueue(holder, { deadLetter: tick });
        const errors = spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await ensureJobQueue(boss, {
                jobName: tick,
                queueOptions: { policy: 'exclusive' },
                schedule: {},
            });
            expect(errors.mock.calls.map(call => call.map(String).join(' ')).join('\n')).toContain(
                'violates foreign key constraint'
            );
        } finally {
            errors.mockRestore();
        }
        expect((await boss.getQueue(tick))?.policy).toBe('singleton');
        expect(await countJobs(boss, tick)).toBe(tickCount + 1);
        expect(await boss.getSchedules(tick)).toHaveLength(1);
    });

    it('never recreates an unscheduled queue, which holds real work', async () => {
        await boss.createQueue(entity, { policy: 'singleton' });
        await boss.send(entity, { work: true });
        await ensureJobQueue(boss, { jobName: entity, queueOptions: { policy: 'exclusive' } });
        expect((await boss.getQueue(entity))?.policy).toBe('singleton');
        expect(await countJobs(boss, entity)).toBe(1);
    });

    it('shortens an existing queue to the one-day retention, policy untouched', async () => {
        await boss.createQueue(entity, { policy: 'singleton' });
        expect((await boss.getQueue(entity))?.deleteAfterSeconds).toBe(604_800);
        await ensureJobQueue(boss, { jobName: entity, queueOptions: { policy: 'singleton' } });
        const queue = await boss.getQueue(entity);
        expect(queue?.deleteAfterSeconds).toBe(JOB_RETENTION_SECONDS);
        expect(queue?.policy).toBe('singleton');
    });

    it('counts queued jobs from the queued-job index, as getQueueStats does', async () => {
        await boss.createQueue(entity);
        await boss.insert(entity, [{ data: {} }, { data: {} }, { data: {}, startAfter: 3600 }]);
        await boss.send(entity, { active: true }, { priority: 1 });
        await boss.fetch(entity);
        expect(await countQueuedJobs(entity)).toBe((await boss.getQueueStats(entity)).queuedCount);
        expect(await countQueuedJobs(entity)).toBe(3);
    });
});

const tickCount = 300;

// The production shape: a singleton tick queue with its schedule, a backlog of waiting ticks, and
// one tick left active by a stopped instance.
const seedSingletonTicks = async (boss: PgBoss, name: string) => {
    await boss.createQueue(name, { policy: 'singleton' });
    await boss.schedule(name, '*/5 * * * *');
    await boss.insert(
        name,
        Array.from({ length: tickCount }, (_, index) => ({ data: { index } }))
    );
    await boss.send(name, { active: true }, { priority: 1 });
    const [active] = await boss.fetch(name);
    expect(active?.data).toEqual({ active: true });
};

const countJobs = async (boss: PgBoss, name: string) => {
    const { rows } = await boss
        .getDb()
        .executeSql('SELECT count(*)::int AS count FROM pgboss.job WHERE name = $1', [name]);
    return (rows[0] as { count: number }).count;
};

const dropTestQueues = async (boss: PgBoss) => {
    for (const name of [holder, tick, entity]) await boss.deleteQueue(name);
};
