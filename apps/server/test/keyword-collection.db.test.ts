import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { catalogQueries } from '@/db/catalog-search-schema';
import { checkpointDiscoveryPage } from '@/db/discovery-checkpoint';
import { discoveryTargets, brandDiscoveryProducts } from '@/db/discovery-target-schema';
import { claimKeywordExploration, stopDiscoveryWork } from '@/db/discovery-work';
import { db } from '@/db/index';
import {
    keywordDiscoveryAttempts,
    keywordExplorationPasses,
    keywordProducts,
} from '@/db/keyword-collection-schema';
import { resolveScheduledKeywordHead } from '@/db/keyword-scheduling';
import { products } from '@/db/product-schema';
import { persistDiscoveredSpApiProducts } from '@/services/spapi-keyword-discovery';
import {
    acceptDiscoveryFixture,
    claimDiscoveryFixture,
    discoveryNow as now,
    discoveryProduct,
    fetchDiscoveryReceipt,
    primeCatalogCapacity,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
} from './discovery-fixture';

const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('scoped listing acquisition', () => {
    beforeEach(resetDiscoveryFixture);
    it('discovers stored-tier keywords without Keepa admission or available Keepa capacity', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        const work = await claimDiscoveryFixture();
        expect(work.target.id).toBe(target.id);
        expect(await resolveScheduledKeywordHead({ queryId: target.queryId, now })).toEqual({
            kind: 'notDue',
        });
        await primeCatalogCapacity();
        await acceptDiscoveryFixture(work, [discoveryProduct('B0TST00001')]);
        const [query] = await db
            .select()
            .from(catalogQueries)
            .where(eq(catalogQueries.id, target.queryId));
        expect(query.tier).toBe('stored');
        expect(query.latestSuccessfulRunAt).toBeNull();
        expect((await db.select().from(products))[0].historyAdmissionState).toBe('notAdmitted');
    });
    it('finds eligible work beyond thirty deferred targets', async () => {
        for (let i = 0; i < 31; i += 1) {
            const target = await seedDiscoveryTarget({ kind: 'keyword', term: `fishing ${i}` });
            if (i < 30)
                await db.insert(keywordExplorationPasses).values({
                    targetId: target.id,
                    stopReason: 'lowYield',
                    resumeAt: later(86_400),
                });
        }
        expect((await claimDiscoveryFixture()).scope).toEqual({
            kind: 'keyword',
            term: 'fishing 30',
        });
    });
    it('yields a continuation to an unvisited peer and resumes without repeating its page', async () => {
        const first = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await seedDiscoveryTarget({ kind: 'keyword', term: 'nurse shirt' });
        await primeCatalogCapacity();
        const work = await claimDiscoveryFixture();
        const accepted = await acceptDiscoveryFixture(work, [discoveryProduct('B0TST00001')]);
        await stopDiscoveryWork({
            passId: work.pass.id,
            claimToken: work.claimToken,
            reason: 'jobCap',
            now,
        });
        const peer = await claimDiscoveryFixture(later(10));
        expect(peer.target.id).not.toBe(first.id);
        await stopDiscoveryWork({
            passId: peer.pass.id,
            claimToken: peer.claimToken,
            reason: 'budget',
            retryAt: later(100),
            now: later(10),
        });
        const resumed = await claimDiscoveryFixture(later(20));
        expect(resumed.pass.id).toBe(accepted.pass.id);
        expect(resumed.pass.nextPageToken).toBe('next-page');
        expect(resumed.pass.nextPage).toBe(1);
    });
    it('keeps brand scope out of generic keyword membership and coverage', async () => {
        const target = await seedDiscoveryTarget({
            kind: 'brand',
            term: 'shirt',
            brandName: 'Independent Studio',
        });
        await primeCatalogCapacity();
        const work = await claimDiscoveryFixture();
        expect(work.scope).toEqual({
            kind: 'brand',
            term: 'shirt',
            brandName: 'Independent Studio',
        });
        await acceptDiscoveryFixture(work, [discoveryProduct('B0TST00001')]);
        expect(await db.select().from(keywordProducts)).toHaveLength(0);
        expect(await db.select().from(brandDiscoveryProducts)).toHaveLength(1);
        const [query] = await db
            .select()
            .from(catalogQueries)
            .where(eq(catalogQueries.id, target.queryId));
        expect(query.merchObservedAt).toBeNull();
        expect(query.latestSuccessfulRunAt).toBeNull();
    });
    it('accepts a page once and records real new identities separately from membership', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await primeCatalogCapacity();
        const work = await claimDiscoveryFixture();
        const attemptId = await fetchDiscoveryReceipt(work);
        const input = {
            passId: work.pass.id,
            claimToken: work.claimToken,
            attemptId,
            page: 0,
            nextPageToken: 'page-two',
            observedAt: now,
            products: [
                discoveryProduct('B0TST00001'),
                discoveryProduct('B0TST00002', { isMerchListing: false }),
                discoveryProduct('B0TST00003', { isMerchListing: null }),
            ],
            persist: persistDiscoveredSpApiProducts,
        };
        await checkpointDiscoveryPage(input);
        await checkpointDiscoveryPage(input);
        expect(await db.select().from(products)).toHaveLength(3);
        const [receipt] = await db.select().from(keywordDiscoveryAttempts);
        expect(receipt).toMatchObject({
            status: 'accepted',
            resultCount: 3,
            newProducts: 3,
            newMerchProducts: 1,
            knownMerch: 1,
            unknownProducts: 1,
            nonMerchProducts: 1,
            newMerchMemberships: 1,
        });
        await seedDiscoveryTarget({
            kind: 'brand',
            term: 'shirt',
            brandName: 'Independent Studio',
        });
        const peer = await claimDiscoveryFixture(later(10));
        await acceptDiscoveryFixture(peer, [discoveryProduct('B0TST00001')], later(10));
        const receipts = await db
            .select()
            .from(keywordDiscoveryAttempts)
            .where(eq(keywordDiscoveryAttempts.passId, peer.pass.id));
        expect(receipts[0]).toMatchObject({ newProducts: 0, newMerchMemberships: 1 });
    });
    it('rejects an expired worker before any Product write', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        const old = await claimDiscoveryFixture();
        await primeCatalogCapacity();
        const attemptId = await fetchDiscoveryReceipt(old);
        const current = await claimDiscoveryFixture(later(301));
        expect(current.claimToken).not.toBe(old.claimToken);
        await expect(
            checkpointDiscoveryPage({
                passId: old.pass.id,
                claimToken: old.claimToken,
                attemptId,
                page: 0,
                nextPageToken: null,
                observedAt: later(302),
                products: [discoveryProduct('B0TST00001')],
                persist: persistDiscoveredSpApiProducts,
            })
        ).rejects.toThrow('ownership');
        expect(await db.select().from(products)).toHaveLength(0);
    });
    it('keeps old observed depth when an expired continuation starts a new pass', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        const [old] = await db
            .insert(keywordExplorationPasses)
            .values({
                targetId: target.id,
                nextPage: 3,
                contiguousPages: 3,
                nextPageToken: 'old-frontier',
                stopReason: 'jobCap',
                lastPageAt: new Date(now.getTime() - 2 * 86_400_000),
                resumeAt: now,
            })
            .returning();
        const work = await claimDiscoveryFixture();
        expect(work.pass.id).not.toBe(old.id);
        expect(work.pass.nextPage).toBe(0);
        expect(work.pass.contiguousPages).toBe(0);
        const [retained] = await db
            .select()
            .from(keywordExplorationPasses)
            .where(eq(keywordExplorationPasses.id, old.id));
        expect(retained).toMatchObject({
            contiguousPages: 3,
            nextPageToken: 'old-frontier',
            stopReason: 'cursorExpired',
        });
    });
    it('records successful emptiness separately from capacity and retry failures', async () => {
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await primeCatalogCapacity();
        const work = await claimDiscoveryFixture();
        const first = await acceptDiscoveryFixture(work, [], now, null);
        expect(first.pass.resumeAt.getTime() - now.getTime()).toBeGreaterThanOrEqual(
            6.3 * 86_400_000
        );
        expect(first.pass.resumeAt.getTime() - now.getTime()).toBeLessThanOrEqual(7.7 * 86_400_000);
        await stopDiscoveryWork({
            passId: work.pass.id,
            claimToken: work.claimToken,
            reason: 'complete',
            now,
        });
        const nextAt = first.pass.resumeAt;
        await primeCatalogCapacity(nextAt);
        const again = await claimDiscoveryFixture(nextAt);
        const second = await acceptDiscoveryFixture(again, [], nextAt, null);
        expect(second.pass.resumeAt.getTime() - nextAt.getTime()).toBeGreaterThanOrEqual(
            27 * 86_400_000
        );
        expect(second.pass.resumeAt.getTime() - nextAt.getTime()).toBeLessThanOrEqual(
            33 * 86_400_000
        );
        expect(
            (await db.select().from(discoveryTargets).where(eq(discoveryTargets.id, target.id)))[0]
                .emptyCount
        ).toBe(2);
    });
});
