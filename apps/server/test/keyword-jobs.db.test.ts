import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { buildDatabaseUrl } from '@/config/database-url';
import { db } from '@/db/index';
import { brandAnalyticsSearchTerms } from '@/db/brand-analytics-schema';
import { registerBrandAnalyticsTrials } from '@/db/brand-analytics-trials';
import { claimKeywordExploration } from '@/db/discovery-work';
import { discoveryEvidence, discoveryTargets } from '@/db/discovery-target-schema';
import { listDueKeywordScans } from '@/db/keyword-work-due';
import { prepareJobQueues } from '@/jobs/index';
import { keywordQueues } from '@/jobs/keyword-job-queues';
import { readKeywordJobsStatus } from '@/services/keyword-jobs-status';
import { scheduleBrandAnalytics } from '@/services/brand-analytics-scheduler';
import { scheduleKeywordWork } from '@/services/keyword-work-scheduler';
import { resetDiscoveryFixture, seedDiscoveryTarget } from './discovery-fixture';

const market = 'ATVPDKIKX0DER';
const addTerm = (normalizedTerm: string, searchFrequencyRank: number) =>
    db.insert(brandAnalyticsSearchTerms).values({
        marketplaceId: market,
        normalizedTerm,
        searchFrequencyRank,
        apparelClicks: 1,
        clickedAsins: ['B0TST00001'],
        firstSeenWeek: '2026-10-18',
        lastSeenWeek: '2026-10-18',
    });

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword pipeline jobs', () => {
    beforeEach(resetDiscoveryFixture);
    it('lists a due keyword head until a job claims it, then leaves it to that job', async () => {
        const now = new Date();
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        expect(await listDueKeywordScans(now, 10)).toEqual([
            { id: target.id, depth: false, tracked: expect.any(Boolean) },
        ]);
        const claimed = await claimKeywordExploration(now, { targetId: target.id });
        expect(claimed?.target.id).toBe(target.id);
        expect(await listDueKeywordScans(now, 10)).toEqual([]);
        const other = await seedDiscoveryTarget({ kind: 'keyword', term: 'nurse shirt' }, now);
        expect(await claimKeywordExploration(now, { targetId: target.id })).toBeNull();
        expect((await claimKeywordExploration(now, { targetId: other.id }))?.target.id).toBe(
            other.id
        );
    });
    it('registers the most searched Brand Analytics terms as trials once', async () => {
        await addTerm('rare fishing shirt', 900_000);
        await addTerm('fishing shirt', 50);
        await addTerm('nurse shirt', 4_000);
        const now = new Date();
        expect(await registerBrandAnalyticsTrials(2, now)).toBe(2);
        const targets = await db.select().from(discoveryTargets);
        expect(targets).toHaveLength(2);
        expect(targets.every(target => target.tracking === 'trial' && target.enabled)).toBe(true);
        const evidence = await db.select().from(discoveryEvidence);
        expect(evidence.map(row => [row.kind, row.sourceKey, row.eligible])).toEqual([
            ['brandAnalytics', 'week:2026-10-18', true],
            ['brandAnalytics', 'week:2026-10-18', true],
        ]);
        // Trials scan most searched first.
        const due = await listDueKeywordScans(now, 10);
        expect(due).toHaveLength(2);
        expect(await registerBrandAnalyticsTrials(10, now)).toBe(1);
        expect(await registerBrandAnalyticsTrials(10, now)).toBe(0);
    });
    it('enqueues each due entity once however often the scheduler runs', async () => {
        const boss = new PgBoss({ connectionString: buildDatabaseUrl(), schema: 'pgboss' });
        boss.on('error', error => {
            throw error;
        });
        await boss.start();
        try {
            await prepareJobQueues(boss);
            await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, new Date());
            await addTerm('nurse shirt', 10);
            const queues = {
                queued: async (name: string) => (await boss.getQueueStats(name)).queuedCount,
                insert: async (name: string, jobs: Parameters<typeof boss.insert>[1]) =>
                    jobs.length
                        ? ((await boss.insert(name, jobs, { returnId: true }))?.length ?? 0)
                        : 0,
            };
            expect((await scheduleBrandAnalytics(boss)).importId).not.toBeNull();
            expect((await boss.getQueueStats(keywordQueues.brandAnalytics)).queuedCount).toBe(1);
            expect(await registerBrandAnalyticsTrials(2000)).toBe(1);
            const first = await scheduleKeywordWork(queues);
            expect(first.paused ? null : first.enqueued).toMatchObject({ scanHeads: 2 });
            const second = await scheduleKeywordWork(queues);
            expect(second.paused ? null : second.enqueued).toMatchObject({ scanHeads: 0 });
            expect((await boss.getQueueStats(keywordQueues.scan)).queuedCount).toBe(2);
            const status = await readKeywordJobsStatus();
            expect(status.queues.find(queue => queue.name === keywordQueues.scan)).toMatchObject({
                waiting: 2,
                running: 0,
            });
            expect(status.brandAnalytics).toMatchObject({ keptTerms: 1, awaitingTrial: 0 });
            expect(status.brandAnalytics.latestWeek?.status).toBe('pending');
            expect(status.scanDue).toEqual({
                awaitingFirstScan: 2,
                checksDue: 0,
                oldestCheckDueAt: null,
            });
            const checkAt = new Date(Date.now() - 60_000);
            await db
                .update(discoveryTargets)
                .set({ headObservedAt: checkAt, nextCheckAt: checkAt })
                .where(eq(discoveryTargets.tracking, 'tracked'));
            expect((await readKeywordJobsStatus()).scanDue).toEqual({
                awaitingFirstScan: 1,
                checksDue: 1,
                oldestCheckDueAt: checkAt.toISOString(),
            });
        } finally {
            await boss.stop({ graceful: false });
        }
    });
});
