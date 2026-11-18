import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { catalogQueries } from '@/db/catalog-search-schema';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { db } from '@/db/index';
import {
    claimKeywordAutocomplete,
    finishKeywordAutocomplete,
} from '@/db/keyword-autocomplete-work';
import { keywordAutocomplete } from '@/db/keyword-autocomplete-schema';
import { listDueAutocomplete } from '@/db/keyword-work-due';
import { resetDiscoveryFixture } from './discovery-fixture';

const now = new Date('2026-10-25T12:00:00Z');
const minute = 60_000;
const at = (ms: number) => new Date(now.getTime() + ms);

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword target indexes', () => {
    beforeEach(async () => {
        await resetDiscoveryFixture();
        await seedTargets();
    });

    it('lists due autocomplete seeds exactly as the join over every tracked keyword did', async () => {
        for (const limit of [1, 5, 13, 30, 1000]) {
            const reference = await db.execute<{ id: string }>(referenceDueAutocomplete(limit));
            const listed = await listDueAutocomplete(now, limit);
            expect(listed.map(row => row.id)).toEqual(reference.map(row => row.id));
        }
        expect((await listDueAutocomplete(now, 1000)).length).toBeGreaterThan(20);
    });

    it('marks a seed expanded when its expansion completes, leaving the index', async () => {
        const [first] = await listDueAutocomplete(now, 1);
        const work = await claimKeywordAutocomplete(now);
        if (!work) throw new Error('Expected a due seed');
        expect(work.queryId).toBe(first.id);
        await finishKeywordAutocomplete(work, ['alpha shirt'], now);
        const [target] = await db
            .select({ autocompleted: discoveryTargets.autocompleted })
            .from(discoveryTargets)
            .where(eq(discoveryTargets.queryId, work.queryId));
        expect(target?.autocompleted).toBe(true);
        expect((await listDueAutocomplete(now, 1000)).map(row => row.id)).not.toContain(
            work.queryId
        );
    });

    it('reads due seeds and creation-order cursors from their partial indexes', async () => {
        const iso = sql.raw(`'${now.toISOString()}'::timestamp`);
        const plans = await explainAll([
            sql`select t.query_id from discovery_targets t
                where t.kind='keyword' and t.enabled and t.tracking='tracked' and not t.autocompleted
                    and not exists (select 1 from keyword_autocomplete a where a.query_id=t.query_id)
                order by t.popularity_score desc nulls last, t.query_id limit 30`,
            sql`select a.query_id from keyword_autocomplete a
                join discovery_targets t on t.query_id=a.query_id and t.kind='keyword'
                where a.stage<>'complete' and a.next_due_at<=${iso}
                    and t.enabled and t.tracking='tracked'
                order by a.next_due_at, t.popularity_score desc nulls last, a.query_id limit 30`,
            sql`select id from discovery_targets
                where kind = 'keyword' and enabled and head_observed_at is not null
                    and (created_at, id) > (${iso}, '00000000-0000-4000-8000-000000000000'::uuid)
                order by created_at, id limit 500`,
            sql`select id from discovery_targets where kind = 'keyword' and tracking = 'tracked'
                and (created_at, id) > (select ${iso}, '00000000-0000-4000-8000-000000000000'::uuid)
                order by created_at, id limit 2000`,
        ]);
        expect(plans[0]).toContain('discovery_targets_autocomplete_due_idx');
        expect(plans[1]).toContain('keyword_autocomplete_due_idx');
        for (const plan of plans.slice(2)) {
            expect(plan).toContain('discovery_targets_keyword_cursor_idx');
            // The cursor bounds the read: a row comparison the index can start from.
            expect(plan).toContain('Index Cond: (ROW(created_at, id) >');
        }
    });
});

// The listing before seeds had an index, kept as the reference.
const referenceDueAutocomplete = (limit: number) => {
    const iso = sql.raw(`'${now.toISOString()}'::timestamp`);
    return sql`
        select q.id from catalog_queries q
        join discovery_targets t on t.query_id=q.id
        left join keyword_autocomplete a on a.query_id=q.id
        where q.marketplace_id='ATVPDKIKX0DER' and t.kind='keyword' and t.enabled and t.tracking='tracked'
            and (a.query_id is null or a.stage<>'complete')
            and (a.query_id is null or (a.next_due_at<=${iso}
                and (a.claim_at is null or a.claim_at<=${iso}-interval '5 minutes')))
        order by a.next_due_at asc nulls last, t.popularity_score desc nulls last, q.id
        limit ${limit}`;
};

// Plans are read over a production-shaped table: thousands of tracked keywords, most expanded.
const explainAll = async (statements: ReturnType<typeof sql>[]) =>
    db.transaction(async tx => {
        await tx.execute(sql`insert into catalog_queries (source, marketplace_id, normalized_term, display_term)
            select 'keepa', 'ATVPDKIKX0DER', 'bulk ' || n, 'bulk ' || n from generate_series(1, 20000) n`);
        await tx.execute(sql`insert into discovery_targets
                (query_id, kind, tracking, enabled, popularity_score, head_observed_at, autocompleted)
            select id, 'keyword', case when n % 5 = 0 then 'tracked' else 'dropped' end, true,
                (n * 37) % 100, now(), n % 50 <> 0
            from (select id, row_number() over (order by id) n from catalog_queries
                where normalized_term like 'bulk %') bulk`);
        await tx.execute(
            sql`update discovery_targets set enabled = false where tracking = 'dropped'`
        );
        await tx.execute(sql`insert into keyword_autocomplete (query_id, stage, completed_at)
            select query_id, 'complete', now() from discovery_targets
            where autocompleted and tracking = 'tracked' and query_id not in (select query_id from keyword_autocomplete)`);
        await tx.execute(sql`analyze catalog_queries`);
        await tx.execute(sql`analyze discovery_targets`);
        await tx.execute(sql`analyze keyword_autocomplete`);
        // A fixture this small can make a full scan look as cheap; the question is whether the
        // index can serve each read (production plans were checked separately).
        await tx.execute(sql`set local enable_seqscan = off`);
        const plans: string[] = [];
        for (const statement of statements) {
            const rows = await tx.execute<{ 'QUERY PLAN': string }>(sql`explain ${statement}`);
            plans.push(rows.map(row => row['QUERY PLAN']).join('\n'));
        }
        return plans;
    });

// Targets in every stage with every expansion state: none, pending and due, pending in backoff,
// claimed, claim lapsed, complete (flag set or, as rows written before the flag, not).
const seedTargets = async () => {
    const trackings = ['tracked', 'tracked', 'tracked', 'trial', 'dropped'] as const;
    const scores = [null, 10, 55.5, 80, 55.5, 3];
    const expansions = ['none', 'none', 'due', 'backoff', 'claimed', 'lapsed', 'complete', 'stale'];
    for (let index = 0; index < 160; index += 1) {
        const [query] = await db
            .insert(catalogQueries)
            .values({
                source: 'keepa',
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: `seed ${index}`,
                displayTerm: `seed ${index}`,
            })
            .returning({ id: catalogQueries.id });
        const expansion = expansions[(index >> 1) % expansions.length];
        await db.insert(discoveryTargets).values({
            queryId: query.id,
            kind: 'keyword',
            tracking: trackings[index % trackings.length],
            enabled: index % 7 !== 0,
            popularityScore: scores[index % scores.length],
            headObservedAt: index % 3 === 0 ? null : at(-index * minute),
            createdAt: at(-(index % 11) * minute),
            autocompleted: expansion === 'complete',
        });
        if (expansion === 'none') continue;
        const claimed = expansion === 'claimed' ? at(-minute) : at(-10 * minute);
        await db.insert(keywordAutocomplete).values({
            queryId: query.id,
            stage: expansion === 'complete' || expansion === 'stale' ? 'complete' : 'pending',
            nextDueAt: expansion === 'backoff' ? at(30 * minute) : at(-(index % 5) * minute),
            ...(expansion === 'claimed' || expansion === 'lapsed'
                ? { claimAt: claimed, claimToken: crypto.randomUUID() }
                : {}),
        });
    }
};
