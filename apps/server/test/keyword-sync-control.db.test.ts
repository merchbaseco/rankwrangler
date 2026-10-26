import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { automaticSyncControl } from '@/db/automatic-sync-schema';
import { readAutomaticSync, setAutomaticSyncPaused } from '@/db/automatic-sync';
import { eventLogs } from '@/db/ops-schema';
import { products } from '@/db/product-schema';
import {
    claimKeywordExploration,
    nextDiscoveryWakeAt,
    reserveDiscoveryAttempt,
} from '@/db/discovery-work';
import { reserveCatalogCapacity } from '@/db/spapi-capacity';
import { claimKeywordAutocomplete } from '@/db/keyword-autocomplete-work';
import {
    claimProductKeywordMining,
    saveKeywordRecommendations,
    claimKeywordJudgments,
    finishProductKeywordMining,
    releaseProductKeywordMining,
} from '@/db/keyword-mining-work';
import { saveKeywordJudgments } from '@/db/mined-keyword-candidates';
import { reserveKeywordMiningCall, deferKeywordMiningProvider } from '@/db/keyword-mining-capacity';
import { keywordMiningCapacity } from '@/db/keyword-mining-schema';
import { mineProductKeywords } from '@/services/product-keyword-mining';
import {
    resetDiscoveryFixture,
    seedDiscoveryTarget,
    primeCatalogCapacity,
    acceptDiscoveryFixture,
    discoveryProduct,
} from './discovery-fixture';

const now = new Date();
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword sync pause control', () => {
    beforeEach(async () => {
        await setAutomaticSyncPaused(false, 'test');
        await resetDiscoveryFixture();
        await db.delete(eventLogs).where(eq(eventLogs.primitiveId, 'automatic-sync'));
    });
    afterEach(() => setAutomaticSyncPaused(false, 'test'));
    it('persists the switch and logs only real changes', async () => {
        await setAutomaticSyncPaused(true, 'operator');
        await setAutomaticSyncPaused(true, 'operator');
        expect((await readAutomaticSync()).paused).toBe(true);
        const saved = await db.select().from(automaticSyncControl);
        expect(saved[0]).toMatchObject({ paused: true, updatedBy: 'operator' });
        await setAutomaticSyncPaused(false, 'operator');
        const logs = await db
            .select()
            .from(eventLogs)
            .where(eq(eventLogs.primitiveId, 'automatic-sync'));
        expect(logs.map(row => row.action).sort()).toEqual([
            'keyword.sync.paused',
            'keyword.sync.resumed',
        ]);
    });
    it('fails closed without a state row and does not consume keyword provider capacity while paused', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await db
            .insert(products)
            .values({ asin: 'B0TST00001', marketplaceId: 'ATVPDKIKX0DER', isMerchListing: true });
        await db.delete(automaticSyncControl);
        expect((await readAutomaticSync()).paused).toBe(true);
        expect(await claimKeywordExploration()).toBeNull();
        expect(await claimKeywordAutocomplete()).toBeNull();
        expect(await claimProductKeywordMining()).toBeNull();
        expect(await nextDiscoveryWakeAt()).toBeNull();
        for (const provider of ['ads', 'jev', 'autocomplete'] as const)
            await expect(reserveKeywordMiningCall(provider)).rejects.toThrow('deferred');
        expect(await db.select().from(keywordMiningCapacity)).toHaveLength(0);
    });
    it('preserves the product scan checkpoint when paused between pages and permits foreground lookups', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        await primeCatalogCapacity(now);
        const work = await claimKeywordExploration(now);
        if (!work?.pass.claimToken) throw new Error('Missing discovery claim');
        const first = await acceptDiscoveryFixture(
            { ...work, claimToken: work.pass.claimToken },
            [discoveryProduct('B0TST00001')],
            now,
            'second-page'
        );
        await setAutomaticSyncPaused(true, 'operator');
        const attemptId = await reserveDiscoveryAttempt({
            passId: first.pass.id,
            claimToken: work.pass.claimToken,
            page: 1,
            now,
        });
        expect(
            await reserveCatalogCapacity({
                priority: 'background',
                attemptId: attemptId!,
                protectedQueued: false,
                now,
            })
        ).toMatchObject({ kind: 'deferred', reason: 'paused' });
        expect(first.pass).toMatchObject({
            nextPage: 1,
            nextPageToken: 'second-page',
            failureCount: 0,
        });
        await primeCatalogCapacity(now);
        expect(
            await reserveCatalogCapacity({ priority: 'foreground', protectedQueued: false, now })
        ).toMatchObject({ kind: 'granted' });
    });
    it('resumes saved Ads recommendations without refetching or counting pause as failure', async () => {
        await db
            .insert(products)
            .values({ asin: 'B0TST00001', marketplaceId: 'ATVPDKIKX0DER', isMerchListing: true });
        let adsCalls = 0;
        let jevCalls = 0;
        let clock = new Date();
        const deps = {
            configured: () => true,
            claim: () => claimProductKeywordMining(clock),
            recommend: async () => {
                adsCalls++;
                await setAutomaticSyncPaused(true, 'operator');
                return ['fishing shirt'];
            },
            saveRecommendations: saveKeywordRecommendations,
            claimJudgments: claimKeywordJudgments,
            judge: async (rows: { id: string; term: string }[]) => {
                await reserveKeywordMiningCall('jev');
                jevCalls++;
                return rows.map(row => ({ id: row.id, probability: 0.95 }));
            },
            saveJudgments: saveKeywordJudgments,
            finish: finishProductKeywordMining,
            release: releaseProductKeywordMining,
        };
        expect((await mineProductKeywords(deps)).kind).toBe('deferred');
        expect(adsCalls).toBe(1);
        expect(jevCalls).toBe(0);
        await setAutomaticSyncPaused(false, 'operator');
        clock = new Date(Date.now() + 61_000);
        expect((await mineProductKeywords(deps)).kind).toBe('complete');
        expect(adsCalls).toBe(1);
        expect(jevCalls).toBe(1);
    });
    it('makes pause wait for an admission already waiting on a capacity lock', async () => {
        await db
            .insert(keywordMiningCapacity)
            .values({ provider: 'ads', nextStartAt: new Date(0) });
        let release!: () => void;
        let ready!: () => void;
        const held = new Promise<void>(resolve => {
            release = resolve;
        });
        const acquired = new Promise<void>(resolve => {
            ready = resolve;
        });
        const holder = db.transaction(async tx => {
            await tx
                .select()
                .from(keywordMiningCapacity)
                .where(eq(keywordMiningCapacity.provider, 'ads'))
                .for('update');
            ready();
            await held;
        });
        await acquired;
        const admission = reserveKeywordMiningCall('ads');
        let pause: Promise<unknown> | undefined;
        try {
            await waitForLock('keyword_mining_capacity');
            pause = setAutomaticSyncPaused(true, 'operator');
            await waitForLock('automatic_sync_control');
            release();
            await admission;
            await pause;
            expect((await readAutomaticSync()).paused).toBe(true);
            expect((await db.select().from(keywordMiningCapacity))[0].starts).toBe(1);
            await expect(reserveKeywordMiningCall('ads')).rejects.toThrow('deferred');
        } finally {
            release();
            await Promise.allSettled([holder, admission, pause]);
        }
    });
    it('does not erase a provider cooldown on resume', async () => {
        await deferKeywordMiningProvider('ads', new Date(Date.now() + 300_000));
        await setAutomaticSyncPaused(true, 'operator');
        await setAutomaticSyncPaused(false, 'operator');
        await expect(reserveKeywordMiningCall('ads')).rejects.toThrow('deferred');
    });
});

const waitForLock = async (table: string) => {
    for (let attempt = 0; attempt < 100; attempt++) {
        const [state] = await db.execute<{ waiting: boolean }>(
            sql`select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like ${`%"${table}"%`}) waiting`
        );
        if (state.waiting) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`Expected lock wait for ${table}`);
};
