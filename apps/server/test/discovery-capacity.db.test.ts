import { beforeEach, describe, expect, it } from 'bun:test';
import { PgBoss } from 'pg-boss';
import { buildDatabaseUrl } from '@/config/database-url';
import { prepareJobQueues } from '@/jobs/index';
import { processKeywordSyncJob } from '@/jobs/process-keyword-sync';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    reserveDiscoveryAttempt,
    stopDiscoveryWork,
    nextDiscoveryWakeAt,
} from '@/db/discovery-work';
import {
    reserveCatalogCapacity,
    observeCatalogCapacity,
    readCatalogCapacity,
} from '@/db/spapi-capacity';
import { keywordDiscoveryAttempts } from '@/db/keyword-collection-schema';
import {
    acceptDiscoveryFixture,
    claimDiscoveryFixture,
    discoveryNow as now,
    discoveryProduct,
    primeCatalogCapacity,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
} from './discovery-fixture';
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('durable Catalog capacity', () => {
    beforeEach(resetDiscoveryFixture);
    it('continues past the old daily and per-keyword pilot caps without buying history', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await primeCatalogCapacity();
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
        expect((await readCatalogCapacity())?.backgroundStarts).toBe(25);
        expect(
            (await db.select().from(keywordDiscoveryAttempts)).filter(
                row => row.status === 'accepted'
            )
        ).toHaveLength(25);
        expect((await claimDiscoveryFixture(later(260))).pass.nextPage).toBe(25);
    });
    it('serializes concurrent physical starts and leaves foreground headroom', async () => {
        await primeCatalogCapacity();
        const starts = await Promise.all(
            Array.from({ length: 8 }, () =>
                reserveCatalogCapacity({ priority: 'foreground', protectedQueued: false, now })
            )
        );
        expect(starts.filter(row => row.kind === 'granted')).toHaveLength(2);
        expect((await readCatalogCapacity())?.foregroundStarts).toBe(2);
        expect(
            await reserveCatalogCapacity({
                priority: 'foreground',
                protectedQueued: false,
                now: later(1),
            })
        ).toEqual({ kind: 'granted' });
    });
    it('persists a rate wakeup across worker restarts without advancing the page', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await primeCatalogCapacity();
        const work = await claimDiscoveryFixture();
        await acceptDiscoveryFixture(work, [discoveryProduct('B0TST00001')]);
        const id = await reserveDiscoveryAttempt({
            passId: work.pass.id,
            claimToken: work.claimToken,
            page: 1,
            now,
        });
        const decision = await reserveCatalogCapacity({
            priority: 'background',
            attemptId: id!,
            protectedQueued: false,
            now,
        });
        expect(decision.kind).toBe('deferred');
        if (decision.kind !== 'deferred') throw new Error('Expected rate wakeup');
        expect(decision.retryAt).toEqual(new Date(now.getTime() + 6250));
        await stopDiscoveryWork({
            passId: work.pass.id,
            claimToken: work.claimToken,
            attemptId: id!,
            reason: 'budget',
            retryAt: decision.retryAt,
            now,
        });
        expect(await nextDiscoveryWakeAt(now)).toEqual(decision.retryAt);
        const restarted = await claimDiscoveryFixture(decision.retryAt);
        expect(restarted.pass.nextPage).toBe(1);
        expect(restarted.pass.failureCount).toBe(0);
        expect(
            (
                await db
                    .select()
                    .from(keywordDiscoveryAttempts)
                    .where(eq(keywordDiscoveryAttempts.id, id!))
            )[0].startedAt
        ).toBeNull();
    });
    it('honors durable throttle cooldown and fences stale physical dispatch', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await primeCatalogCapacity();
        const old = await claimDiscoveryFixture();
        const id = await reserveDiscoveryAttempt({
            passId: old.pass.id,
            claimToken: old.claimToken,
            page: 0,
            now,
        });
        await claimDiscoveryFixture(later(301));
        await expect(
            reserveCatalogCapacity({
                priority: 'background',
                attemptId: id!,
                protectedQueued: false,
                now: later(301),
            })
        ).rejects.toThrow('ownership');
        expect((await readCatalogCapacity())?.backgroundStarts).toBe(0);
        await observeCatalogCapacity({
            observedRate: 2,
            throttled: true,
            retryAfterMs: 120_000,
            failed: true,
            now,
        });
        const decision = await reserveCatalogCapacity({
            priority: 'foreground',
            protectedQueued: false,
            now: later(1),
        });
        expect(decision).toMatchObject({
            kind: 'deferred',
            reason: 'cooldown',
            retryAt: later(120),
        });
        expect((await readCatalogCapacity())?.effectiveRps).toBe(0.8);
    });
    it('coalesces a dated followup and watchdog while allowing one active job', async () => {
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
            const name = processKeywordSyncJob.jobName;
            expect((await boss.getQueues()).find(queue => queue.name === name)?.policy).toBe(
                'short'
            );
            const id = await boss.send(name, {}, { singletonKey: name });
            const active = await boss.fetch(name);
            expect(active[0].id).toBe(id);
            const wake = await boss.send(
                name,
                {},
                { singletonKey: name, startAfter: new Date(Date.now() + 10_000) }
            );
            expect(wake).not.toBeNull();
            expect(await boss.send(name, {}, { singletonKey: name })).toBeNull();
            await boss.complete(name, id!);
            expect(await boss.fetch(name)).toHaveLength(0);
            const resumed = await boss.fetch(name, { ignoreStartAfter: true });
            expect(resumed[0].id).toBe(wake);
            await boss.complete(name, wake!);
        } finally {
            await boss.stop({ graceful: false });
        }
    });
});
