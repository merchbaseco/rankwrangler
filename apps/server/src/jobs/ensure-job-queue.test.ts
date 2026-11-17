import { describe, expect, it, mock } from 'bun:test';
import type { PgBoss } from 'pg-boss';
import { ensureJobQueue } from './ensure-job-queue';

describe('ensureJobQueue', () => {
    it('recreates a scheduled queue whose stored policy is not the declared one', async () => {
        const boss = fakeBoss({ tick: 'singleton' });
        await ensureJobQueue(boss.boss, {
            jobName: 'tick',
            queueOptions: { policy: 'exclusive' },
            schedule: {},
        });
        expect(boss.deleteQueue).toHaveBeenCalledWith('tick');
        expect(boss.stored.tick).toBe('exclusive');
    });
    it('leaves a scheduled queue alone when its policy already matches', async () => {
        const boss = fakeBoss({ tick: 'standard' });
        await ensureJobQueue(boss.boss, { jobName: 'tick', queueOptions: {}, schedule: {} });
        expect(boss.deleteQueue).not.toHaveBeenCalled();
    });
    it('never recreates an unscheduled queue, which holds real work', async () => {
        const boss = fakeBoss({ entity: 'singleton' });
        await ensureJobQueue(boss.boss, {
            jobName: 'entity',
            queueOptions: { policy: 'exclusive' },
        });
        expect(boss.deleteQueue).not.toHaveBeenCalled();
        expect(boss.stored.entity).toBe('singleton');
    });
});

const fakeBoss = (stored: Record<string, string>) => {
    const deleteQueue = mock(async (name: string) => {
        delete stored[name];
    });
    const boss = {
        createQueue: async (name: string, options: { policy?: string }) => {
            stored[name] ??= options.policy ?? 'standard';
        },
        getQueue: async (name: string) => (name in stored ? { policy: stored[name] } : null),
        deleteQueue,
    } as unknown as PgBoss;
    return { boss, stored, deleteQueue };
};
