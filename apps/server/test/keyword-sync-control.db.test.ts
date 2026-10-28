import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { automaticSyncControl } from '@/db/automatic-sync-schema';
import { readAutomaticSync, setAutomaticSyncPaused } from '@/db/automatic-sync';
import { eventLogs } from '@/db/ops-schema';
import { products } from '@/db/product-schema';
import { claimKeywordExploration, reserveDiscoveryAttempt } from '@/db/discovery-work';
import { spApiBackgroundGate } from '@/db/provider-gates';
import { reserveCatalogCapacity } from '@/db/spapi-capacity';
import { claimKeywordAutocomplete } from '@/db/keyword-autocomplete-work';
import { deferAutocomplete, reserveAutocompleteCall } from '@/db/keyword-autocomplete-capacity';
import { keywordProviderCapacity } from '@/db/keyword-autocomplete-schema';
import {
    claimBrandAnalyticsImport,
    ensureBrandAnalyticsImport,
} from '@/db/brand-analytics-imports';
import { brandAnalyticsSearchTerms } from '@/db/brand-analytics-schema';
import { registerBrandAnalyticsTrials } from '@/db/brand-analytics-trials';
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
    it('fails closed without a state row and spends no scan or provider capacity while paused', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' });
        await db.insert(products).values({
            asin: 'B0TST00001',
            marketplaceId: 'ATVPDKIKX0DER',
            title: 'Fishing Shirt',
            isMerchListing: true,
        });
        await db.delete(automaticSyncControl);
        expect((await readAutomaticSync()).paused).toBe(true);
        expect(await claimKeywordExploration()).toBeNull();
        expect(await claimKeywordAutocomplete()).toBeNull();
        expect(await spApiBackgroundGate()).toBeNull();
        await expect(reserveAutocompleteCall()).rejects.toThrow('deferred');
        expect(await db.select().from(keywordProviderCapacity)).toHaveLength(0);
        await db.insert(brandAnalyticsSearchTerms).values({
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: 'nurse shirt',
            searchFrequencyRank: 10,
            apparelClicks: 1,
            clickedAsins: [],
            firstSeenWeek: '2026-10-18',
            lastSeenWeek: '2026-10-18',
        });
        // The import and keyword listing are free and ignore the pause; only scans wait.
        expect(await registerBrandAnalyticsTrials(10)).toBe(1);
        const due = await ensureBrandAnalyticsImport();
        expect(due && (await claimBrandAnalyticsImport(due.id))).not.toBeNull();
        expect(await claimKeywordExploration()).toBeNull();
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
    it('makes pause wait for an admission already waiting on a capacity lock', async () => {
        await db
            .insert(keywordProviderCapacity)
            .values({ provider: 'autocomplete', nextStartAt: new Date(0) });
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
                .from(keywordProviderCapacity)
                .where(eq(keywordProviderCapacity.provider, 'autocomplete'))
                .for('update');
            ready();
            await held;
        });
        await acquired;
        const admission = reserveAutocompleteCall();
        let pause: Promise<unknown> | undefined;
        try {
            await waitForLock('keyword_mining_capacity');
            pause = setAutomaticSyncPaused(true, 'operator');
            await waitForLock('automatic_sync_control');
            release();
            await admission;
            await pause;
            expect((await readAutomaticSync()).paused).toBe(true);
            expect((await db.select().from(keywordProviderCapacity))[0].starts).toBe(1);
            await expect(reserveAutocompleteCall()).rejects.toThrow('deferred');
        } finally {
            release();
            await Promise.allSettled([holder, admission, pause]);
        }
    });
    it('does not erase a provider cooldown on resume', async () => {
        await deferAutocomplete(new Date(Date.now() + 300_000));
        await setAutomaticSyncPaused(true, 'operator');
        await setAutomaticSyncPaused(false, 'operator');
        await expect(reserveAutocompleteCall()).rejects.toThrow('deferred');
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
