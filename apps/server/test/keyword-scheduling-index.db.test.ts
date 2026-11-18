import { beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { catalogQueries } from '@/db/catalog-search-schema';
import { db } from '@/db/index';
import { readScheduledKeywordLoad } from '@/db/keyword-scheduled-load';
import { listScheduledKeywordHeads, retireKeywordAdmissions } from '@/db/keyword-scheduling';
import { resetDiscoveryFixture } from './discovery-fixture';

const now = new Date('2026-10-25T12:00:00Z');
const day = 86_400_000;
const at = (days: number) => new Date(now.getTime() + days * day);

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword scheduling indexes', () => {
    beforeEach(async () => {
        await resetDiscoveryFixture();
        await seedQueries();
    });

    it('retires admissions in one statement exactly as the four ordered statements did', async () => {
        const captured = await captureRollback(referenceRetire(now));
        expect(captured).toHaveLength(2900);
        await retireKeywordAdmissions(now);
        const after = [...(await db.execute<Snapshot>(snapshot))];
        expect(after).toEqual(captured);
        // The fixture exercises every transition, including two in one tick.
        const reasons = new Set(after.map(row => `${row.tier}:${row.admission_reason}`));
        for (const outcome of [
            'cold:leaseExpired',
            'stored:probationExpired',
            'stored:inactive',
            'cold:candidateProbe',
        ])
            expect(reasons).toContain(outcome);
    });

    it('reads the same load and unobserved count as the whole-table sum', async () => {
        const [old] = await db.execute<{ daily: number; unobserved: number }>(sql`
            select coalesce(sum(12::numeric / greatest(interval_days, 1)), 0)::float daily,
                (select count(*)::int from catalog_queries
                    where tier <> 'stored' and latest_successful_run_at is null) unobserved
            from catalog_queries where tier <> 'stored'`);
        const load = await db.transaction(tx => readScheduledKeywordLoad(tx, 12));
        expect(load.unobserved).toBe(old.unobserved);
        expect(load.daily).toBeCloseTo(old.daily, 9);
        expect(load.unobserved).toBeGreaterThan(0);
    });

    it('reads admitted and requested keywords from their partial indexes', async () => {
        const iso = now.toISOString();
        const plans = await explainAll([
            sql`select coalesce(sum(1::numeric / greatest(interval_days, 1)), 0) from catalog_queries
                where tier <> 'stored'`,
            sql`select id from catalog_queries where tier <> 'stored'
                and next_due_at <= ${sql.raw(`'${iso}'`)}::timestamp
                and (next_refresh_attempt_at is null or next_refresh_attempt_at <= ${sql.raw(`'${iso}'`)}::timestamp)`,
            sql`update catalog_queries set updated_at = now() where tier <> 'stored'
                and admission_reason = 'none'`,
            sql`select id from catalog_queries
                where (tier = 'stored' or (active_until > ${sql.raw(`'${iso}'`)}::timestamp and tier <> 'hot'))
                    and (last_requested_at > ${sql.raw(`'${at(-30).toISOString()}'`)}::timestamp
                        or active_until > ${sql.raw(`'${iso}'`)}::timestamp)
                order by active_until desc nulls last, last_requested_at desc nulls last, created_at
                limit 20`,
        ]);
        expect(plans[0]).toContain('catalog_queries_scheduled_idx');
        expect(plans[1]).toContain('catalog_queries_scheduled_idx');
        expect(plans[2]).toContain('catalog_queries_scheduled_idx');
        expect(plans[3]).toContain('catalog_queries_requested_idx');
        expect(plans[3]).toContain('catalog_queries_active_refresh_due_idx');
        expect(await listScheduledKeywordHeads(now, 500)).not.toHaveLength(0);
    });
});

type Snapshot = {
    id: string;
    tier: string;
    interval_days: number;
    next_due_at: string | null;
    admission_reason: string | null;
};
const snapshot = sql`select id, tier, interval_days, next_due_at::text, admission_reason
    from catalog_queries order by id`;

// The statements retireKeywordAdmissions ran before it became one, kept as the reference.
const referenceRetire = (moment: Date) => {
    const t = sql.raw(`'${moment.toISOString()}'::timestamp`);
    const inactiveBefore = sql.raw(
        `'${new Date(moment.getTime() - 90 * day).toISOString()}'::timestamp`
    );
    return [
        sql`update catalog_queries set tier='cold', interval_days=30, next_due_at=${t},
            admission_reason='leaseExpired', updated_at=${t}
            where admission_reason='researchLease' and active_until <= ${t}`,
        sql`update catalog_queries set tier='stored', admission_reason='probationExpired',
            next_due_at=null, updated_at=${t}
            where tier='probation' and probation_until <= ${t} and merch_observed_at is null
                and (active_until is null or active_until <= ${t})`,
        sql`update catalog_queries set tier='cold', interval_days=30, next_due_at=${t}, updated_at=${t}
            where tier='probation' and probation_until <= ${t} and merch_observed_at is not null`,
        sql`update catalog_queries set tier='stored', admission_reason='inactive', next_due_at=null,
            updated_at=${t}
            where tier <> 'stored' and (active_until is null or active_until <= ${t})
                and (last_requested_at is null or last_requested_at <= ${inactiveBefore})`,
    ];
};

const captureRollback = async (statements: ReturnType<typeof referenceRetire>) => {
    let rows: Snapshot[] = [];
    await db
        .transaction(async tx => {
            for (const statement of statements) await tx.execute(statement);
            rows = [...(await tx.execute<Snapshot>(snapshot))];
            tx.rollback();
        })
        .catch(() => undefined);
    return rows;
};

const explainAll = async (statements: ReturnType<typeof sql>[]) =>
    db.transaction(async tx => {
        await tx.execute(sql`analyze catalog_queries`);
        await tx.execute(sql`set local enable_seqscan = off`);
        const plans: string[] = [];
        for (const statement of statements) {
            const rows = await tx.execute<{ 'QUERY PLAN': string }>(sql`explain ${statement}`);
            plans.push(rows.map(row => row['QUERY PLAN']).join('\n'));
        }
        return plans;
    });

// Every combination that matters to the transitions, interleaved by coprime cycles, plus the
// long tail of stored keywords nobody asked for that makes up most of production.
const seedQueries = async () => {
    const tiers = ['stored', 'probation', 'hot', 'cold', 'warm'];
    const reasons = [
        null,
        'researchLease',
        'candidateProbe',
        'leaseExpired',
        'inactive',
        'probationExpired',
    ];
    const leases = [null, at(-1), at(3)];
    const probations = [null, at(-2), at(10), at(-40)];
    const merch = [null, at(-5)];
    const requested = [null, at(-10), at(-50), at(-100), at(-89.9)];
    const admitted = [null, at(-40), at(-5)];
    const observed = [null, at(-3)];
    const rows: (typeof catalogQueries.$inferInsert)[] = [];
    for (let index = 0; index < 900; index += 1) {
        const tier = tiers[index % tiers.length];
        const reason = reasons[index % reasons.length];
        rows.push({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: `term ${index}`,
            displayTerm: `term ${index}`,
            tier,
            // Only admission writes researchLease, always with tier hot, and every write that
            // stores a keyword rewrites its reason, so no stored row carries a research lease.
            admissionReason: tier === 'stored' && reason === 'researchLease' ? null : reason,
            activeUntil: leases[index % leases.length],
            probationUntil: probations[index % probations.length],
            merchObservedAt: merch[(index >> 1) % merch.length],
            lastRequestedAt: requested[index % requested.length],
            admittedAt: admitted[index % admitted.length],
            latestSuccessfulRunAt: observed[(index >> 2) % observed.length],
            intervalDays: [1, 7, 30][index % 3],
            nextDueAt: index % tiers.length === 0 ? null : at((index % 7) - 3),
        });
    }
    for (let index = 0; index < 2000; index += 1)
        rows.push({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: `stored ${index}`,
            displayTerm: `stored ${index}`,
        });
    for (let start = 0; start < rows.length; start += 500)
        await db.insert(catalogQueries).values(rows.slice(start, start + 500));
};
