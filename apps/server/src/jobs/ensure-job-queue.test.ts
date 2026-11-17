import { describe, expect, it, mock, spyOn } from 'bun:test';
import type { PgBoss } from 'pg-boss';
import { ensureJobQueue } from './ensure-job-queue';

// Recreation itself runs against real pg-boss in test/ensure-job-queue.db.test.ts.
describe('ensureJobQueue', () => {
    it('leaves a scheduled queue alone when its policy already matches', async () => {
        const boss = fakeBoss({ tick: 'standard' });
        await ensureJobQueue(boss.boss, { jobName: 'tick', queueOptions: {}, schedule: {} });
        expect(boss.executeSql).not.toHaveBeenCalled();
    });
    it('never recreates an unscheduled queue, which holds real work', async () => {
        const boss = fakeBoss({ entity: 'singleton' });
        await ensureJobQueue(boss.boss, {
            jobName: 'entity',
            queueOptions: { policy: 'exclusive' },
        });
        expect(boss.executeSql).not.toHaveBeenCalled();
        expect(boss.stored.entity).toBe('singleton');
    });
    it('logs a failed recreation with its cause and lets startup continue', async () => {
        const boss = fakeBoss(
            { tick: 'singleton' },
            new Error('canceling statement due to lock timeout')
        );
        const errors = spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await ensureJobQueue(boss.boss, {
                jobName: 'tick',
                queueOptions: { policy: 'exclusive' },
                schedule: {},
            });
            expect(errors).toHaveBeenCalledWith(
                '[Jobs] Could not recreate tick queue; it keeps policy singleton:',
                expect.objectContaining({ message: 'canceling statement due to lock timeout' })
            );
        } finally {
            errors.mockRestore();
        }
    });
});

const fakeBoss = (stored: Record<string, string>, sqlError?: Error) => {
    const executeSql = mock(async () => {
        if (sqlError) throw sqlError;
        return { rows: [] };
    });
    const boss = {
        createQueue: async (name: string, options: { policy?: string }) => {
            stored[name] ??= options.policy ?? 'standard';
        },
        getQueue: async (name: string) => (name in stored ? { policy: stored[name] } : null),
        getDb: () => ({ executeSql }),
    } as unknown as PgBoss;
    return { boss, stored, executeSql };
};
