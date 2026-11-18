import { beforeEach, describe, expect, it } from 'bun:test';
import { type SQL, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
    keepaRefreshDueAt,
    keepaRefreshTracked,
    spApiBlindspotDueAt,
    spApiBlindspotTracked,
    spApiRefreshDueAt,
    spApiRefreshTracked,
} from '@/db/product-refresh-due';
import { keepaHistoryRefreshQueue, products, spApiSyncQueue } from '@/db/schema';
import { reprocessStaleProducts } from '@/jobs/reprocess-stale-products';
import { getKeepaScheduledRefreshCandidates } from '@/services/keepa-scheduled-refresh';
import {
    listDueSpApiBlindspots,
    listDueSpApiRefreshes,
    SPAPI_REFRESH_BATCH,
} from '@/services/spapi-refresh-selection';
import { enqueueSpApiSyncQueueItems } from '@/services/spapi-sync-queue';

const market = 'ATVPDKIKX0DER';
const now = new Date('2026-10-23T12:00:00Z');
const hour = 3_600_000;
const day = 24 * hour;
const ago = (ms: number) => new Date(now.getTime() - ms);

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('product refresh due indexes', () => {
    beforeEach(async () => {
        if (
            process.env.RANKWRANGLER_DATABASE_HOST !== '127.0.0.1' ||
            process.env.RANKWRANGLER_DATABASE_NAME !== 'rankwrangler_catalog_test'
        )
            throw new Error('Refresh index tests require the private loopback database.');
        await db.execute(
            sql`truncate products, product_ingest_queue, keepa_history_refresh_queue cascade`
        );
    });

    it('lists the same BSR-tier SP-API refreshes as the staleness rule, most overdue first', async () => {
        await seedVaried();
        const reference = await db.execute<{ asin: string }>(referenceSpApiStale);
        const listed = await listDueSpApiRefreshes(now, 100_000);
        expect(listed.map(row => row.asin).sort()).toEqual(reference.map(row => row.asin).sort());
        expect(listed.length).toBeGreaterThan(10);
        expect((await listDueSpApiRefreshes(now, 5)).map(row => row.asin)).toEqual(
            listed.slice(0, 5).map(row => row.asin)
        );
        // Never fetched sorts first: it has waited longest.
        expect(listed[0].asin).toBe('S-NEVER');
    });

    it('lists the blind-spot rule, plus a missed probation check the old rule hid', async () => {
        await seedVaried();
        const reference = await db.execute<{ asin: string }>(referenceBlindspot);
        const listed = (await listDueSpApiBlindspots(now, 100_000)).map(row => row.asin);
        const old = reference.map(row => row.asin);
        expect(old.every(asin => listed.includes(asin))).toBe(true);
        // Created forty days ago and last seen at day fifteen: its day-29 check was missed. The
        // old rule stopped asking once the first thirty days ended, until day forty-five.
        expect(listed.filter(asin => !old.includes(asin))).toEqual(['B-MISSED-PROBATION']);
        expect(old.length).toBeGreaterThan(3);
    });

    it('lists the same Keepa candidates in the same order as the tier walk', async () => {
        await seedVaried();
        await db
            .insert(keepaHistoryRefreshQueue)
            .values({ marketplaceId: market, asin: 'K-QUEUED' });
        for (const limit of [2, 7, 1000]) {
            const reference = await db.execute<{ asin: string }>(referenceKeepa(limit));
            const listed = await getKeepaScheduledRefreshCandidates({ limit, now });
            expect(listed.map(row => row.asin)).toEqual(reference.map(row => row.asin));
        }
        expect((await getKeepaScheduledRefreshCandidates({ limit: 1000, now })).length).toBe(5);
    });

    it('reads each listing from its due-at index', async () => {
        await seedVaried();
        await seedFresh(20_000);
        const at = sql.raw(`'${now.toISOString()}'::timestamp`);
        const plans = await explainAll([
            sql`select asin from products where ${spApiRefreshTracked(products)}
                and ${spApiRefreshDueAt(products)} < ${at}
                order by ${spApiRefreshDueAt(products)}, id limit 2000`,
            sql`select asin from products where ${spApiBlindspotTracked(products)}
                and ${spApiBlindspotDueAt(products)} <= ${at}
                order by ${spApiBlindspotDueAt(products)}, created_at, id limit 20`,
            sql`with due as materialized (select asin, root_category_bsr, created_at from products
                    where ${keepaRefreshTracked(products)} and ${keepaRefreshDueAt(products)} <= ${at})
                select asin from due order by root_category_bsr, created_at limit 600`,
        ]);
        expect(plans[0]).toContain('products_spapi_refresh_due_idx');
        expect(plans[0]).not.toContain('Sort');
        expect(plans[1]).toContain('products_spapi_blindspot_due_idx');
        expect(plans[1]).not.toContain('Sort');
        expect(plans[2]).toContain('products_keepa_refresh_due_idx');
    });

    it('drains a large backlog in bounded batches without an oversized insert', async () => {
        // 40,000 rows in one insert would need 80,000 bind parameters, past Postgres's 65,535.
        const items = Array.from({ length: 40_000 }, (_, index) => ({
            marketplaceId: market,
            asin: `Q${String(index).padStart(9, '0')}`,
        }));
        expect(await enqueueSpApiSyncQueueItems(items)).toBe(40_000);
        await db.execute(sql`truncate product_ingest_queue`);

        await db.execute(sql`insert into products (marketplace_id, asin, is_merch_listing,
                root_category_bsr, sp_api_fetched_at, created_at)
            select ${market}, 'P' || lpad(n::text, 9, '0'), true, 100000 + n,
                ${ago(3 * day).toISOString()}::timestamp - n * interval '1 second', ${ago(90 * day).toISOString()}::timestamp
            from generate_series(1, ${SPAPI_REFRESH_BATCH + 700}) n`);
        const first = await reprocessStaleProducts(now);
        expect(first).toMatchObject({
            staleProductCount: SPAPI_REFRESH_BATCH,
            enqueuedCount: SPAPI_REFRESH_BATCH,
            errorMessage: null,
        });
        // The most overdue (fetched longest ago) went first.
        const [{ newest }] = await db.execute<{ newest: string }>(
            sql`select max(asin) newest from product_ingest_queue`
        );
        expect(newest).toBe(`P${String(SPAPI_REFRESH_BATCH + 700).padStart(9, '0')}`);
        const second = await reprocessStaleProducts(now);
        expect(second.enqueuedCount).toBe(0);
        const [{ queued }] = await db.execute<{ queued: number }>(
            sql`select count(*)::int queued from ${spApiSyncQueue}`
        );
        expect(queued).toBe(SPAPI_REFRESH_BATCH);
    });
});

// The selections before the due-at indexes, kept as the reference.
const at = (date: Date) => sql.raw(`'${date.toISOString()}'::timestamp`);
const referenceSpApiStale = sql`select asin from products
    where is_merch_listing and amazon_listing_status = 'active' and root_category_bsr is not null and (
        sp_api_fetched_at is null
        or (root_category_bsr < 200000 and sp_api_fetched_at < ${at(ago(day))})
        or (root_category_bsr >= 200000 and root_category_bsr < 500000 and sp_api_fetched_at < ${at(ago(3 * day))})
        or (root_category_bsr >= 500000 and root_category_bsr < 1000000 and sp_api_fetched_at < ${at(ago(7 * day))})
        or (root_category_bsr >= 1000000 and root_category_bsr < 3000000 and sp_api_fetched_at < ${at(ago(14 * day))})
        or (root_category_bsr >= 3000000 and sp_api_fetched_at < ${at(ago(30 * day))}))`;
const referenceBlindspot = sql`select asin from products where amazon_listing_status = 'active' and (
    (is_merch_listing = true and root_category_bsr is null
        and (greatest(sp_api_fetched_at, sp_api_resolved_at) is null
            or greatest(sp_api_fetched_at, sp_api_resolved_at) <= ${at(now)} - (case
                when created_at > ${at(now)} - interval '30 days' then
                    case when greatest(sp_api_fetched_at, sp_api_resolved_at) < created_at + interval '3 days'
                        then interval '3 days' else interval '14 days' end
                else interval '30 days' end)))
    or (is_merch_listing = false and sp_api_fetched_at is null and sp_api_resolved_at is null))`;
const referenceKeepa = (limit: number) => sql`select p.asin from products p
    where p.is_merch_listing = true and p.amazon_listing_status = 'active'
        and p.history_admission_state = 'admitted' and p.root_category_bsr is not null
        and not exists (select 1 from keepa_history_refresh_queue q
            where q.marketplace_id = p.marketplace_id and q.asin = p.asin)
        and ((p.root_category_bsr < 50000 and (p.keepa_fetched_at is null or p.keepa_fetched_at <= ${at(ago(12 * hour))}))
            or (p.root_category_bsr >= 50000 and p.root_category_bsr < 300000
                and (p.keepa_fetched_at is null or p.keepa_fetched_at <= ${at(ago(day))}))
            or (p.root_category_bsr >= 300000 and p.root_category_bsr < 1000000
                and (p.keepa_fetched_at is null or p.keepa_fetched_at <= ${at(ago(7 * day))})))
    order by p.root_category_bsr asc, p.created_at asc limit ${limit}`;

const explainAll = async (statements: SQL[]) =>
    db.transaction(async tx => {
        await tx.execute(sql`analyze products`);
        const plans: string[] = [];
        for (const statement of statements) {
            const rows = await tx.execute<{ 'QUERY PLAN': string }>(sql`explain ${statement}`);
            plans.push(rows.map(row => row['QUERY PLAN']).join('\n'));
        }
        return plans;
    });

// Rows on both sides of every tier boundary and threshold, for all three rules.
const seedVaried = async () => {
    const rows: (typeof products.$inferInsert)[] = [];
    const add = (asin: string, overrides: Partial<typeof products.$inferInsert>) =>
        rows.push({
            marketplaceId: market,
            asin,
            isMerchListing: true,
            createdAt: ago(200 * day - rows.length * hour),
            ...overrides,
        });
    const tiers: [number, number][] = [
        [150_000, day],
        [200_000, 3 * day],
        [499_999, 3 * day],
        [700_000, 7 * day],
        [1_000_000, 14 * day],
        [2_999_999, 14 * day],
        [3_000_000, 30 * day],
        [9_000_000, 30 * day],
    ];
    for (const [bsr, interval] of tiers)
        for (const offset of [-hour, -1, 1, hour])
            add(`S-${bsr}-${offset}`, {
                rootCategoryBsr: bsr,
                spApiFetchedAt: ago(interval + offset),
            });
    add('S-NEVER', { rootCategoryBsr: 120_000, spApiFetchedAt: null });
    add('S-DELETED', {
        rootCategoryBsr: 120_000,
        amazonListingStatus: 'deleted',
        spApiFetchedAt: ago(9 * day),
    });
    add('S-NONMERCH', {
        isMerchListing: false,
        rootCategoryBsr: 120_000,
        spApiFetchedAt: ago(9 * day),
        spApiResolvedAt: ago(9 * day),
    });

    const blind = (
        asin: string,
        createdDaysAgo: number,
        fetched: number | null,
        resolved: number | null = null
    ) =>
        add(asin, {
            rootCategoryBsr: null,
            createdAt: ago(createdDaysAgo * day),
            spApiFetchedAt: fetched === null ? null : ago(fetched * day),
            spApiResolvedAt: resolved === null ? null : ago(resolved * day),
        });
    blind('B-NEW-SEEN-AT-ONCE', 4, 4);
    blind('B-NEW-RECHECKED', 2, 2);
    blind('B-PROBATION-RECENT', 10, 6);
    blind('B-PROBATION-DUE', 25, 20);
    blind('B-MISSED-PROBATION', 40, 25);
    blind('B-OLD-STALE', 60, 31);
    blind('B-OLD-FRESH', 60, 10);
    blind('B-RESOLVED-NEWER', 60, 45, 5);
    blind('B-NEVER', 90, null);
    add('B-KEEPA-ONLY', { isMerchListing: false, spApiFetchedAt: null, spApiResolvedAt: null });
    add('B-KEEPA-SEEN', { isMerchListing: false, spApiFetchedAt: ago(60 * day) });

    const admitted = {
        historyAdmissionState: 'admitted' as const,
        historyAdmissionReason: 'capacity' as const,
        historyAdmittedAt: ago(30 * day),
        spApiFetchedAt: ago(hour),
    };
    const keepa: [string, number, number | null][] = [
        ['K-TWICE-DUE', 10_000, 13 * hour],
        ['K-TWICE-FRESH', 20_000, 11 * hour],
        ['K-TWICE-EDGE', 49_999, 12 * hour],
        ['K-DAILY-DUE', 50_000, 25 * hour],
        ['K-DAILY-FRESH', 60_000, 23 * hour],
        ['K-NEVER', 299_999, null],
        ['K-WEEKLY-DUE', 300_000, 8 * day],
        ['K-WEEKLY-FRESH', 999_999, 6 * day],
        ['K-TOO-RARE', 1_000_000, 30 * day],
        ['K-QUEUED', 30_000, 2 * day],
    ];
    for (const [asin, bsr, fetched] of keepa)
        add(asin, {
            ...admitted,
            rootCategoryBsr: bsr,
            keepaFetchedAt: fetched === null ? null : ago(fetched),
        });
    add('K-NOT-ADMITTED', {
        rootCategoryBsr: 40_000,
        keepaFetchedAt: ago(5 * day),
        spApiFetchedAt: ago(hour),
    });
    await db.insert(products).values(rows);
};

// The fresh majority production holds: tier-fresh, admitted and fetched recently.
const seedFresh = (count: number) =>
    db.execute(sql`insert into products (marketplace_id, asin, is_merch_listing, root_category_bsr,
            sp_api_fetched_at, keepa_fetched_at, history_admission_state, history_admission_reason,
            history_admitted_at, created_at)
        select ${market}, 'F' || lpad(n::text, 9, '0'), true, case when n % 5 = 0 then null else n * 40 end,
            ${at(ago(hour))}, ${at(ago(hour))}, 'admitted', 'capacity', ${at(ago(9 * day))}, ${at(ago(9 * day))}
        from generate_series(1, ${count}) n`);
