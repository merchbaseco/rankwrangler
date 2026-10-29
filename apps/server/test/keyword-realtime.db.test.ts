import { upsertProductInfo } from '@/db/product/upsert-product';
import { discoveryProduct } from './discovery-fixture';
import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { closeRealtimeConnection, type RealtimeEvent } from '@/db/realtime-connection';
import { subscribeToKeywordDirectoryChanged } from '@/services/keyword-directory-events';
import { subscribeToSyncControlChanged } from '@/services/sync-control-events';
import { subscribeToEventLogCreated } from '@/services/event-log-events';
import { notifyKeywordDirectoryRows } from '@/db/keyword-directory-notifications';
import { setAutomaticSyncPaused } from '@/db/automatic-sync';
import { readKeywordDirectory } from '@/db/keyword-directory';
import { keywordDirectoryInput } from '@/api/keyword-directory-input';
import { resetDiscoveryFixture, seedDiscoveryTarget } from './discovery-fixture';

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('committed keyword realtime', () => {
    beforeEach(resetDiscoveryFixture);
    afterAll(async () => {
        await setAutomaticSyncPaused(false, 'test');
        await closeRealtimeConnection();
    });
    it('emits only after commit, suppresses rollback, and reads only requested rows', async () => {
        const received: string[] = [];
        const committed = deferred<void>();
        const stop = await listening(subscribeToKeywordDirectoryChanged, event => {
            if (event.kind === 'changed') {
                received.push(...event.data.terms);
                if (event.data.terms.includes('fishing')) committed.resolve();
            }
        });
        try {
            await expect(
                db.transaction(async tx => {
                    await notifyKeywordDirectoryRows(tx, ['rolled back']);
                    throw new Error('rollback');
                })
            ).rejects.toThrow('rollback');
            await db.transaction(async tx => {
                await notifyKeywordDirectoryRows(tx, ['fishing']);
                expect(received).toEqual([]);
            });
            await within(committed.promise);
            expect(received).toEqual(['fishing']);
            await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing' });
            await seedDiscoveryTarget({ kind: 'keyword', term: 'hawaiian christmas' });
            const all = await readKeywordDirectory(keywordDirectoryInput.parse({}));
            const rows = await readKeywordDirectory(keywordDirectoryInput.parse({}), {
                terms: ['fishing'],
                view: all.view,
            });
            expect(rows.items.map(row => row.term)).toEqual(['fishing']);
            expect(rows.items[0].sortKey).toEqual(
                all.items.find(row => row.term === 'fishing')?.sortKey
            );
            // Row reads ignore the stage filter so the client can drop rows that left its view.
            await db.execute(sql`update discovery_targets set tracking='dropped',enabled=false`);
            const dropped = await readKeywordDirectory(keywordDirectoryInput.parse({}), {
                terms: ['fishing'],
                view: all.view,
            });
            expect(dropped.items[0]).toMatchObject({ stage: 'dropped', freshness: null });
        } finally {
            await stop();
        }
    });
    it('reconciles a reconnected database listener and removes browser listeners afterward', async () => {
        const reconnected = deferred<void>();
        let ready = 0;
        const terms: string[] = [];
        const stop = await listening(subscribeToKeywordDirectoryChanged, event => {
            if (event.kind === 'resync' && ++ready > 1) reconnected.resolve();
            if (event.kind === 'changed') terms.push(...event.data.terms);
        });
        await db.execute(
            sql`select pg_terminate_backend(pid) from pg_stat_activity where application_name='rankwrangler-realtime'`
        );
        await within(reconnected.promise);
        stop();
        const delivered = deferred<void>();
        const stopSecond = await listening(subscribeToKeywordDirectoryChanged, event => {
            if (event.kind === 'changed') delivered.resolve();
        });
        try {
            await db.transaction(tx => notifyKeywordDirectoryRows(tx, ['after reconnect']));
            await within(delivered.promise);
            expect(terms).toEqual([]);
        } finally {
            stopSecond();
        }
    });
    it('pushes existing keyword counts when a product becomes Merch', async () => {
        await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing' });
        const source = { ...discoveryProduct('B0TST99999'), isMerchListing: false };
        const product = await upsertProductInfo(source);
        await db.execute(sql`insert into keyword_products(query_id,product_id,first_observed_at,last_observed_at)
            select id,${product.id},now(),now() from catalog_queries where normalized_term='fishing'`);
        const changed = deferred<void>();
        const stop = await listening(subscribeToKeywordDirectoryChanged, event => {
            if (event.kind === 'changed' && event.data.terms.includes('fishing')) changed.resolve();
        });
        try {
            await upsertProductInfo({ ...source, isMerchListing: true });
            await within(changed.promise);
            const rows = await readKeywordDirectory(keywordDirectoryInput.parse({}), {
                terms: ['fishing'],
            });
            expect(rows.items[0].merch).toBe(1);
        } finally {
            stop();
        }
    });
    it('separates sync state and log events without starting keyword work', async () => {
        const sync = deferred<void>();
        const log = deferred<void>();
        const stopSync = await listening(subscribeToSyncControlChanged, event => {
            if (event.kind === 'changed') sync.resolve();
        });
        const stopLog = await listening(subscribeToEventLogCreated, event => {
            if (event.kind === 'changed' && event.data.accountId === 'global') log.resolve();
        });
        try {
            await setAutomaticSyncPaused(true, 'realtime-test');
            await within(Promise.all([sync.promise, log.promise]));
            const result = await db.execute<{ paused: boolean }>(
                sql`select paused from automatic_sync_control where id=1`
            );
            expect(result[0].paused).toBe(true);
            await setAutomaticSyncPaused(false, 'realtime-test');
        } finally {
            await stopSync();
            await stopLog();
        }
    });
});
// Subscribing returns at once; the first resync marks the LISTEN as live.
const listening = async <T>(
    subscribe: (listener: (event: RealtimeEvent<T>) => void) => () => void,
    listener: (event: RealtimeEvent<T>) => void
) => {
    const live = deferred<void>();
    const stop = subscribe(event => {
        if (event.kind === 'resync') live.resolve();
        listener(event);
    });
    await within(live.promise);
    return stop;
};
const within = <T>(promise: Promise<T>) =>
    Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Realtime event timed out')), 1500)
        ),
    ]);

const deferred = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
};
