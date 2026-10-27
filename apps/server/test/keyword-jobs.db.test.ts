import { beforeEach, describe, expect, it } from 'bun:test';
import { PgBoss } from 'pg-boss';
import { buildDatabaseUrl } from '@/config/database-url';
import { db } from '@/db/index';
import { claimKeywordExploration } from '@/db/discovery-work';
import { claimProductKeywordMining } from '@/db/keyword-mining-work';
import {
    listDueKeywordScans,
    listDueProductMining,
    listUnminedProducts,
} from '@/db/keyword-work-due';
import { products } from '@/db/product-schema';
import { prepareJobQueues } from '@/jobs/index';
import { keywordQueues } from '@/jobs/keyword-job-queues';
import { readKeywordJobsStatus } from '@/services/keyword-jobs-status';
import { scheduleKeywordWork } from '@/services/keyword-work-scheduler';
import { eq } from 'drizzle-orm';
import { resetDiscoveryFixture, seedDiscoveryTarget } from './discovery-fixture';

const market = 'ATVPDKIKX0DER';
const addProduct = async (asin: string, rootCategoryBsr: number) => {
    const [product] = await db
        .insert(products)
        .values({ asin, marketplaceId: market, title: 'Fishing Shirt', isMerchListing: true, rootCategoryBsr })
        .returning();
    return product;
};

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword pipeline jobs', () => {
    beforeEach(resetDiscoveryFixture);
    it('lists a due keyword head until a job claims it, then leaves it to that job', async () => {
        const now = new Date();
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        expect(await listDueKeywordScans(now, 10)).toEqual([{ id: target.id, depth: false }]);
        const claimed = await claimKeywordExploration(now, { targetId: target.id });
        expect(claimed?.target.id).toBe(target.id);
        expect(await listDueKeywordScans(now, 10)).toEqual([]);
        const other = await seedDiscoveryTarget({ kind: 'keyword', term: 'nurse shirt' }, now);
        expect(await claimKeywordExploration(now, { targetId: target.id })).toBeNull();
        expect((await claimKeywordExploration(now, { targetId: other.id }))?.target.id).toBe(
            other.id
        );
    });
    it('claims only the named product and lists unmined products by rank', async () => {
        const weak = await addProduct('B0TST00001', 900_000);
        const strong = await addProduct('B0TST00002', 50_000);
        expect((await listUnminedProducts(10)).map(row => row.id)).toEqual([strong.id, weak.id]);
        const now = new Date();
        const work = await claimProductKeywordMining(now, { kind: 'source', productId: weak.id });
        expect(work?.productId).toBe(weak.id);
        expect(
            await claimProductKeywordMining(now, { kind: 'judgment', productId: weak.id })
        ).toBeNull();
        expect((await listUnminedProducts(10)).map(row => row.id)).toEqual([strong.id]);
        const later = new Date(now.getTime() + 301_000);
        expect(await listDueProductMining(later, 'pending', 10)).toEqual([{ id: weak.id }]);
        // A product that stops being active Merch must not keep a queue slot it cannot use.
        await db
            .update(products)
            .set({ amazonListingStatus: 'deleted' })
            .where(eq(products.id, weak.id));
        expect(await listDueProductMining(later, 'pending', 10)).toEqual([]);
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
            await addProduct('B0TST00001', 50_000);
            const queues = {
                queued: async (name: string) => (await boss.getQueueStats(name)).queuedCount,
                insert: async (name: string, jobs: Parameters<typeof boss.insert>[1]) =>
                    jobs.length
                        ? ((await boss.insert(name, jobs, { returnId: true }))?.length ?? 0)
                        : 0,
            };
            const first = await scheduleKeywordWork(queues);
            expect(first.paused ? null : first.enqueued).toMatchObject({
                scanHeads: 1,
                recommendations: 1,
            });
            const second = await scheduleKeywordWork(queues);
            expect(second.paused ? null : second.enqueued).toMatchObject({
                scanHeads: 0,
                recommendations: 0,
            });
            expect((await boss.getQueueStats(keywordQueues.scan)).queuedCount).toBe(1);
            const status = await readKeywordJobsStatus();
            expect(status.queues.find(queue => queue.name === keywordQueues.scan)).toMatchObject({
                waiting: 1,
                running: 0,
            });
        } finally {
            await boss.stop({ graceful: false });
        }
    });
});
