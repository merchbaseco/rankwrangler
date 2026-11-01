import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PgBoss } from 'pg-boss';
import { buildDatabaseUrl } from '@/config/database-url';
import { setAutomaticSyncPaused } from '@/db/automatic-sync';
import { stopDiscoveryWork } from '@/db/discovery-work';
import { db } from '@/db/index';
import { keywordDiscoveryAttempts } from '@/db/keyword-collection-schema';
import { syncRunningGate } from '@/db/provider-gates';
import { startGatedWorker } from '@/jobs/gated-worker';
import { prepareJobQueues } from '@/jobs/index';
import { keywordQueues } from '@/jobs/keyword-job-queues';
import {
    acceptDiscoveryFixture,
    claimDiscoveryFixture,
    discoveryNow as now,
    discoveryProduct,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
} from './discovery-fixture';

const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('scan-keyword queue', () => {
    beforeEach(async () => {
        await setAutomaticSyncPaused(false, 'test');
        await resetDiscoveryFixture();
    });
    afterEach(() => setAutomaticSyncPaused(false, 'test'));
    it('continues a pass page after page without a daily or per-keyword cap', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        for (let i = 0; i < 25; i += 1) {
            const at = later(i * 10);
            const work = await claimDiscoveryFixture(at);
            await acceptDiscoveryFixture(
                work,
                [discoveryProduct(`B0TST${String(i).padStart(5, '0')}`)],
                at,
                `page-${i + 1}`
            );
            await stopDiscoveryWork({
                passId: work.pass.id,
                claimToken: work.claimToken,
                reason: 'jobCap',
                now: at,
            });
        }
        expect(
            (await db.select().from(keywordDiscoveryAttempts)).filter(
                row => row.status === 'accepted'
            )
        ).toHaveLength(25);
        expect((await claimDiscoveryFixture(later(260))).pass.nextPage).toBe(25);
    });
    it('keeps one queued-or-running scan per keyword and accepts its followup after completion', async () => {
        await withBoss(async boss => {
            const name = keywordQueues.scan;
            expect((await boss.getQueues()).find(queue => queue.name === name)?.policy).toBe(
                'exclusive'
            );
            const key = '00000000-0000-4000-8000-0000000000aa';
            const id = await boss.send(name, { targetId: key }, { singletonKey: key, priority: 1 });
            expect(await boss.send(name, { targetId: key }, { singletonKey: key })).toBeNull();
            const active = await boss.fetch(name, { priority: true });
            expect(active[0].id).toBe(id);
            expect(await boss.send(name, { targetId: key }, { singletonKey: key })).toBeNull();
            await boss.complete(name, id!);
            const followup = await boss.send(
                name,
                { targetId: key },
                { singletonKey: key, startAfter: new Date(Date.now() + 10_000) }
            );
            expect(followup).not.toBeNull();
            expect(await boss.fetch(name)).toHaveLength(0);
            const resumed = await boss.fetch(name, { ignoreStartAfter: true });
            expect(resumed[0].id).toBe(followup);
            await boss.complete(name, followup!);
        });
    });
    it('leaves scans queued while sync is paused and runs them once it resumes', async () => {
        await withBoss(async boss => {
            const name = keywordQueues.scan;
            const key = '00000000-0000-4000-8000-0000000000bb';
            const id = await boss.send(name, { targetId: key }, { singletonKey: key });
            await setAutomaticSyncPaused(true, 'operator');
            const runs: string[] = [];
            const worker = startGatedWorker({
                boss,
                name,
                gate: syncRunningGate,
                concurrency: 4,
                pausedPollMs: 20,
                run: async job => {
                    runs.push(job.id);
                    return { didWork: true };
                },
            });
            try {
                await new Promise(resolve => setTimeout(resolve, 150));
                expect(runs).toEqual([]);
                expect((await boss.getJobById(name, id!))?.state).toBe('created');
                await setAutomaticSyncPaused(false, 'operator');
                for (let i = 0; i < 100 && !runs.length; i += 1)
                    await new Promise(resolve => setTimeout(resolve, 10));
                expect(runs).toEqual([id!]);
            } finally {
                await worker.stop();
            }
        });
    });
});

const withBoss = async (run: (boss: PgBoss) => Promise<void>) => {
    const boss = new PgBoss({
        connectionString: buildDatabaseUrl(),
        schema: 'pgboss_discovery_proof',
    });
    boss.on('error', error => {
        throw error;
    });
    await boss.start();
    try {
        await prepareJobQueues(boss);
        await run(boss);
    } finally {
        await boss.stop({ graceful: false });
    }
};
