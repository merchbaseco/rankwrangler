import { eventLogs } from '@/db/ops-schema';
import { beforeEach, describe, it, expect } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { keywordExplorationPasses } from '@/db/keyword-collection-schema';
import { spApiCatalogCapacity } from '@/db/spapi-capacity-schema';
import { products } from '@/db/product-schema';
import { recordProductSearchInterest } from '@/db/product-search-interest';
import { refreshKeywordStandings } from '@/db/refresh-keyword-standings';
import { productSearchInput } from '@/api/product-search-input';
import { claimKeywordExploration, stopDiscoveryWork } from '@/db/discovery-work';
import {
    resetDiscoveryFixture,
    seedDiscoveryTarget,
    claimDiscoveryFixture,
    primeCatalogCapacity,
    acceptDiscoveryFixture,
    discoveryProduct,
    discoveryNow as now,
} from './discovery-fixture';
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('tracked keyword standing', () => {
    beforeEach(resetDiscoveryFixture);
    it('retains hot standing and revisits despite zero new identities or memberships', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'halloween shirt' });
        await primeCatalogCapacity();
        const first = await claimDiscoveryFixture();
        const sample = [
            discoveryProduct('B0TST00001', { rootCategoryBsr: 100_000 }),
            discoveryProduct('B0TST00002', { rootCategoryBsr: 100_000 }),
            discoveryProduct('B0TST00003', { rootCategoryBsr: 100_000 }),
        ];
        const accepted = await acceptDiscoveryFixture(first, sample, now, null);
        await stopDiscoveryWork({
            passId: first.pass.id,
            claimToken: first.claimToken,
            reason: 'complete',
            now,
        });
        let [standing] = await db
            .select()
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, target.id));
        expect(standing).toMatchObject({
            popularityScore: 76,
            standingTier: 'hot',
            intervalDays: 1,
            tracking: 'tracked',
        });
        const next = accepted.pass.resumeAt;
        await primeCatalogCapacity(next);
        const second = await claimDiscoveryFixture(next);
        await acceptDiscoveryFixture(second, sample, next, null);
        [standing] = await db
            .select()
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, target.id));
        expect(standing).toMatchObject({
            popularityScore: 76,
            standingTier: 'hot',
            intervalDays: 2,
        });
        expect(standing.nextCheckAt!.getTime() - next.getTime()).toBeLessThan(2 * 86_400_000);
    });
    it('graduates a trial only once its first page shows enough Merch', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'trial shirt' });
        await db
            .update(discoveryTargets)
            .set({ tracking: 'trial' })
            .where(eq(discoveryTargets.id, target.id));
        await primeCatalogCapacity();
        const first = await claimDiscoveryFixture();
        await acceptDiscoveryFixture(
            first,
            [discoveryProduct('B0TST00001'), discoveryProduct('B0TST00002')],
            now,
            null
        );
        const [standing] = await db
            .select()
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, target.id));
        expect(standing).toMatchObject({ tracking: 'trial', trialFailures: 1, enabled: true });
    });
    it('reactivates a dormant completed keyword immediately when a user searches it', async () => {
        const target = await seedDiscoveryTarget({
            kind: 'keyword',
            term: 'tropical christmas shirt',
        });
        const future = new Date(Date.now() + 30 * 86_400_000);
        await db
            .update(discoveryTargets)
            .set({ tracking: 'dormant', enabled: false, nextCheckAt: future })
            .where(eq(discoveryTargets.id, target.id));
        await db
            .insert(keywordExplorationPasses)
            .values({ targetId: target.id, stopReason: 'sourceEnd', resumeAt: future });
        await recordProductSearchInterest(
            productSearchInput.parse({ term: 'tropical christmas shirt' })
        );
        const activity = await db
            .select()
            .from(eventLogs)
            .where(eq(eventLogs.primitiveId, target.queryId));
        expect(activity.filter(row => row.action === 'keyword.tracking.changed')).toHaveLength(1);
        expect((await claimKeywordExploration(new Date(Date.now() + 100)))?.target.id).toBe(
            target.id
        );
    });
    it('does not starve tracked checks when trial jobs each consume five physical pages', async () => {
        const tracked = await seedDiscoveryTarget({ kind: 'keyword', term: 'tracked niche' });
        for (let i = 0; i < 8; i += 1) {
            const target = await seedDiscoveryTarget({ kind: 'keyword', term: `trial ${i}` });
            await db
                .update(discoveryTargets)
                .set({ tracking: 'trial' })
                .where(eq(discoveryTargets.id, target.id));
        }
        await db
            .insert(spApiCatalogCapacity)
            .values({ id: 1, backgroundStarts: 0, discoveryClaims: 0 });
        const first = await claimDiscoveryFixture();
        expect(first.target.tracking).toBe('trial');
        await stopDiscoveryWork({
            passId: first.pass.id,
            claimToken: first.claimToken,
            reason: 'budget',
            retryAt: new Date(now.getTime() + 86400000),
            now,
        });
        await db
            .update(spApiCatalogCapacity)
            .set({ backgroundStarts: 5 })
            .where(eq(spApiCatalogCapacity.id, 1));
        expect((await claimDiscoveryFixture(new Date(now.getTime() + 1000))).target.id).toBe(
            tracked.id
        );
    });
    it('promotes a cold keyword from fresh product ranks without paying for another search', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'seasonal shirt' });
        const ids = (
            await db
                .insert(products)
                .values(
                    [1, 2, 3].map(i => ({
                        marketplaceId: 'ATVPDKIKX0DER',
                        asin: `B0TST0000${i}`,
                        isMerchListing: true,
                        rootCategoryBsr: 90_000,
                        spApiFetchedAt: now,
                    }))
                )
                .returning()
        ).map(p => p.id);
        await db
            .update(discoveryTargets)
            .set({
                headProductIds: ids,
                headObservedAt: new Date(now.getTime() - 2 * 86400000),
                standingTier: 'cold',
                intervalDays: 30,
                nextCheckAt: new Date(now.getTime() + 28 * 86400000),
            })
            .where(eq(discoveryTargets.id, target.id));
        await refreshKeywordStandings(now);
        const [standing] = await db
            .select()
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, target.id));
        const activity = await db
            .select()
            .from(eventLogs)
            .where(eq(eventLogs.primitiveId, target.queryId));
        expect(activity.filter(row => row.action === 'keyword.standing.changed')).toHaveLength(1);
        expect(standing).toMatchObject({
            standingTier: 'hot',
            popularityScore: 76,
            intervalDays: 1,
            nextCheckAt: now,
        });
    });
    it('does not overwrite a concurrent fresh head with a stale rank-refresh snapshot', async () => {
        const target = await seedDiscoveryTarget({
            kind: 'keyword',
            term: 'concurrent seasonal shirt',
        });
        const [product] = await db
            .insert(products)
            .values({
                marketplaceId: 'ATVPDKIKX0DER',
                asin: 'B0TST00001',
                isMerchListing: true,
                rootCategoryBsr: 10_000,
                spApiFetchedAt: now,
            })
            .returning();
        await db
            .update(discoveryTargets)
            .set({
                headProductIds: [product.id],
                headObservedAt: now,
                standingTier: 'cold',
                intervalDays: 30,
                nextCheckAt: new Date(now.getTime() + 30 * 86400000),
            })
            .where(eq(discoveryTargets.id, target.id));
        let release!: () => void;
        let locked!: () => void;
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        const ready = new Promise<void>(resolve => {
            locked = resolve;
        });
        const freshAt = new Date(now.getTime() + 1000);
        const nextAt = new Date(now.getTime() + 60 * 86400000);
        const writer = db.transaction(async tx => {
            await tx
                .select()
                .from(discoveryTargets)
                .where(eq(discoveryTargets.id, target.id))
                .for('update');
            locked();
            await gate;
            await tx
                .update(discoveryTargets)
                .set({
                    headProductIds: [],
                    headObservedAt: freshAt,
                    popularityScore: 0,
                    standingTier: 'cold',
                    intervalDays: 60,
                    nextCheckAt: nextAt,
                })
                .where(eq(discoveryTargets.id, target.id));
        });
        await ready;
        const refresh = refreshKeywordStandings(now).catch(error => error);
        let blocked = false;
        try {
            for (let i = 0; i < 100; i += 1) {
                const rows = await db.execute(
                    sql`select 1 from pg_stat_activity where wait_event_type='Lock' and query like '%locked as materialized%' and pid<>pg_backend_pid()`
                );
                if (rows.length) {
                    blocked = true;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            expect(blocked).toBe(true);
        } finally {
            release();
        }
        await writer;
        const result = await refresh;
        if (result instanceof Error) throw result;
        const [standing] = await db
            .select()
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, target.id));
        expect(standing).toMatchObject({
            headObservedAt: freshAt,
            popularityScore: 0,
            standingTier: 'cold',
            intervalDays: 60,
            nextCheckAt: nextAt,
        });
    });
});
