import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { db } from '@/db/index';
import { readProductStats, refreshProductStats } from '@/db/product-stats';
import { defineJob } from './job-router';

// Every five minutes: recount the stored Product and provider-call snapshot in one pass. The
// exclusive queue holds one tick queued or running, so a slow pass never has others piling up.
export const refreshProductStatsJob = defineJob('refresh-product-stats', {
    startupSummary: 'every five minutes; recounts the Product and provider-call snapshot',
})
    .input(z.object({}))
    .queue({ policy: 'exclusive' })
    .interval({ everyMs: 5 * 60_000, payload: {} })
    .work(async () => {
        const observedAt = new Date();
        await db.transaction(tx => refreshProductStats(tx, observedAt));
        return { observedAt: observedAt.toISOString() };
    });

/** Sends one count when no snapshot exists yet, and describes the snapshot for startup. */
export const sendMissingProductStatsRefresh = async (boss: PgBoss) => {
    const stats = await readProductStats();
    if (stats) {
        return `Snapshot every five minutes (last counted ${stats.observedAt.toISOString()})`;
    }
    await boss.send(refreshProductStatsJob.jobName, {});
    return 'Snapshot every five minutes (first count queued at startup)';
};
