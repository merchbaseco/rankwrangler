import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { stopDiscoveryWork } from '@/db/discovery-work';
import { db } from '@/db/index';
import { syncKeywordTargets } from '@/db/keyword-target-sync';
import {
    acceptDiscoveryFixture,
    claimDiscoveryFixture,
    discoveryProduct,
    discoveryNow as now,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
} from './discovery-fixture';

const DAY = 86_400_000;

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword directory projection', () => {
    beforeEach(resetDiscoveryFixture);

    it('backfills the same rows the sync derives', async () => {
        await observeKeyword('hot niche', [
            ['B0PRJ00001', 900, true],
            ['B0PRJ00002', 20_000, true],
            ['B0PRJ00003', 5_000, false],
        ]);
        await observeKeyword('slow niche', [['B0PRJ00011', 300_000, true]]);
        const trial = await seedDiscoveryTarget({ kind: 'keyword', term: 'trial niche' }, now);
        await db
            .update(discoveryTargets)
            .set({ tracking: 'trial' })
            .where(eq(discoveryTargets.id, trial.id));
        const dropped = await seedDiscoveryTarget({ kind: 'keyword', term: 'empty niche' }, now);
        await db
            .update(discoveryTargets)
            .set({ tracking: 'dropped', enabled: false })
            .where(eq(discoveryTargets.id, dropped.id));
        const ids = (await db.select({ id: discoveryTargets.id }).from(discoveryTargets)).map(
            row => row.id
        );
        await db.transaction(tx => syncKeywordTargets(tx, ids, 'all'));
        const synced = await directoryRows();
        expect(synced).toHaveLength(4);
        expect(synced.find(row => row.term === 'hot niche')).toMatchObject({
            product_count: 2,
            merch_count: 2,
            shelf_median_bsr: 10_450,
            shelf_elite_count: 2,
            pass_continuing: false,
        });
        expect(synced.find(row => row.term === 'trial niche')).toMatchObject({
            product_count: 0,
            shelf_median_bsr: null,
            shelf_first_available: '{}',
        });

        await db.execute(sql`delete from keyword_directory`);
        await db.execute(sql.raw(backfillStatement()));
        expect(await directoryRows()).toEqual(synced);
    });
});

const directoryRows = async () =>
    (
        await db.execute<Record<string, unknown>>(
            sql`select * from keyword_directory order by query_id`
        )
    ).map(row => ({ ...row }));

/** The migration's backfill, so the tested statement is the shipped one. */
const backfillStatement = () => {
    const file = readFileSync(
        new URL('../drizzle/0071_keyword_directory.sql', import.meta.url),
        'utf8'
    );
    const statement = file
        .split('--> statement-breakpoint')
        .find(part => part.trim().startsWith('INSERT INTO "keyword_directory"'));
    if (!statement) throw new Error('Missing keyword directory backfill');
    return statement;
};

const observeKeyword = async (term: string, heads: [string, number, boolean][]) => {
    const target = await seedDiscoveryTarget({ kind: 'keyword', term }, now);
    const work = await claimDiscoveryFixture(now, target.id);
    await acceptDiscoveryFixture(
        work,
        heads.map(([asin, rank, merch]) =>
            discoveryProduct(asin, {
                rootCategoryBsr: rank,
                isMerchListing: merch,
                fetchedAt: now.toISOString(),
                dateFirstAvailable: new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10),
            })
        ),
        now,
        null
    );
    await stopDiscoveryWork({
        passId: work.pass.id,
        claimToken: work.claimToken,
        reason: 'complete',
        now,
    });
    return target;
};
