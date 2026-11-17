import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { brandAnalyticsSearchTerms } from '@/db/brand-analytics-schema';
import { catalogQueries } from '@/db/catalog-search-schema';
import { recordDiscoveryCandidates } from '@/db/discovery-candidates';
import { discoveryTargets } from '@/db/discovery-target-schema';
import { claimKeywordExploration, stopDiscoveryWork } from '@/db/discovery-work';
import { db } from '@/db/index';
import { keywordExplorationPasses } from '@/db/keyword-collection-schema';
import { syncKeywordScanDue } from '@/db/keyword-scan-due';
import { listDueKeywordScans } from '@/db/keyword-work-due';
import { refreshKeywordStandings } from '@/db/refresh-keyword-standings';
import {
    acceptDiscoveryFixture,
    claimDiscoveryFixture,
    discoveryProduct,
    resetDiscoveryFixture,
    seedDiscoveryTarget,
} from './discovery-fixture';

const minute = 60_000;
const day = 86_400_000;
describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('keyword scan due index', () => {
    beforeEach(resetDiscoveryFixture);
    it('lists the same due scans as the claim rule over every pass state', async () => {
        const now = new Date('2026-10-25T12:00:00Z');
        const at = (ms: number) => new Date(now.getTime() + ms);
        const created = at(-30 * day);
        const cases: Case[] = [
            { term: 'no pass trial' },
            { term: 'no pass tracked', tracking: 'tracked' },
            { term: 'no pass disabled', enabled: false },
            { term: 'dropped', tracking: 'dropped', enabled: false, pass: { resume: -day } },
            { term: 'finished past', pass: { resume: -day } },
            { term: 'finished future', pass: { resume: day } },
            { term: 'next check first', nextCheck: -minute, pass: { resume: 20 * day } },
            { term: 'next check later', nextCheck: day, pass: { resume: 5 * day } },
            { term: 'finished leased', pass: { resume: -day, claim: -2 * minute } },
            { term: 'head running', pass: { stop: 'running', resume: -minute } },
            { term: 'head claimed', pass: { stop: 'running', resume: -day, claim: -minute } },
            {
                term: 'head lease over',
                pass: { stop: 'running', resume: -day, claim: -6 * minute },
            },
            { term: 'backoff', pass: { stop: 'running', resume: 2 * 3_600_000, failures: 2 } },
            { term: 'backoff over', pass: { stop: 'running', resume: -minute, failures: 1 } },
            { term: 'depth budget', pass: { stop: 'budget', page: 3, resume: -3_600_000 } },
            { term: 'depth job cap', pass: { stop: 'jobCap', page: 2, resume: 3_600_000 } },
            {
                term: 'depth ignores next check',
                nextCheck: -day,
                pass: { stop: 'running', page: 2, resume: 3_600_000 },
            },
            {
                term: 'depth claimed',
                pass: { stop: 'running', page: 1, resume: -day, claim: -minute },
            },
            {
                term: 'depth lease over',
                tracking: 'tracked',
                pass: { stop: 'running', page: 1, resume: -day, claim: -10 * minute },
            },
            {
                term: 'latest pass wins',
                pass: { resume: -day },
                latest: { stop: 'running', page: 1, resume: -day, claim: -minute },
            },
        ];
        for (const item of cases) await insertCase(item, created, now);
        await db.transaction(async tx =>
            syncKeywordScanDue(
                tx,
                (await tx.select({ id: discoveryTargets.id }).from(discoveryTargets)).map(
                    row => row.id
                )
            )
        );
        // Instants after every creation: before it, a target does not exist to be listed.
        const instants = [0, -minute, 4 * minute, 7 * minute, 2 * 3_600_000, 2 * day, 30 * day];
        for (const instant of instants) await expectMatchesClaimRule(at(instant));
        expect((await listDueKeywordScans(now, 100)).map(row => row.depth)).toEqual([
            ...Array(7).fill(false),
            true,
            true,
        ]);
    });
    it('keeps the listing true to the claim rule through scans and re-tracking', async () => {
        const base = new Date(Date.now() + 1000);
        const at = (ms: number) => new Date(base.getTime() + ms);
        const check = () =>
            Promise.all(
                [0, 2 * minute, 6 * minute, day, 40 * day].map(ms => expectMatchesClaimRule(at(ms)))
            );
        const tracked = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, base);
        await registerTrial('nurse shirt', base);
        const [trial] = await db
            .select()
            .from(discoveryTargets)
            .where(eq(discoveryTargets.tracking, 'trial'));
        await check();
        const work = await claimDiscoveryFixture(base, tracked.id);
        await check();
        await acceptDiscoveryFixture(work, [discoveryProduct('B0TST00001')], base);
        await check();
        await stopDiscoveryWork({
            passId: work.pass.id,
            claimToken: work.claimToken,
            reason: 'jobCap',
            now: at(minute),
        });
        await check();
        const resumed = await claimDiscoveryFixture(at(2 * minute), tracked.id);
        await stopDiscoveryWork({
            passId: resumed.pass.id,
            claimToken: resumed.claimToken,
            reason: 'failure',
            now: at(2 * minute),
        });
        await check();
        const first = await claimDiscoveryFixture(base, trial.id);
        await acceptDiscoveryFixture(
            first,
            [discoveryProduct('B0TST00002', { isMerchListing: false })],
            base,
            null
        );
        expect((await targetRow(trial.id)).enabled).toBe(false);
        await check();
        await registerTrial('nurse shirt', at(minute), 'interest');
        expect((await targetRow(trial.id)).enabled).toBe(true);
        await check();
        await refreshKeywordStandings(at(day));
        await check();
    });
    it('lists oldest due first, trials registered together most searched first', async () => {
        const now = new Date(Date.now() + 1000);
        await db.insert(brandAnalyticsSearchTerms).values(
            [
                ['rare shirt', 9_000],
                ['top shirt', 5],
                ['mid shirt', 400],
            ].map(([normalizedTerm, searchFrequencyRank]) => ({
                marketplaceId: 'ATVPDKIKX0DER',
                normalizedTerm: normalizedTerm as string,
                searchFrequencyRank: searchFrequencyRank as number,
                apparelClicks: 1,
                clickedAsins: [],
                firstSeenWeek: '2026-10-18',
                lastSeenWeek: '2026-10-18',
            }))
        );
        const old = await seedDiscoveryTarget({ kind: 'keyword', term: 'old shirt' }, now);
        await db
            .update(discoveryTargets)
            .set({ createdAt: new Date(now.getTime() - day) })
            .where(eq(discoveryTargets.id, old.id));
        await db.transaction(tx => syncKeywordScanDue(tx, [old.id]));
        await db.transaction(tx =>
            recordDiscoveryCandidates(
                tx,
                ['rare shirt', 'unranked shirt', 'top shirt', 'mid shirt'].map(term => ({
                    scope: { kind: 'keyword' as const, term },
                    evidence: {
                        kind: 'brandAnalytics' as const,
                        sourceKey: 'week:x',
                        observedAt: now,
                    },
                }))
            )
        );
        const listed = await listDueKeywordScans(now, 10);
        const terms = await Promise.all(listed.map(async row => (await termOf(row.id)) as string));
        expect(terms).toEqual([
            'old shirt',
            'top shirt',
            'mid shirt',
            'rare shirt',
            'unranked shirt',
        ]);
        expect((await listDueKeywordScans(now, 2)).length).toBe(2);
    });
    it('corrects a due time that lists a target too early once its job is refused', async () => {
        const now = new Date(Date.now() + 1000);
        const target = await seedDiscoveryTarget({ kind: 'keyword', term: 'fishing shirt' }, now);
        await db.insert(keywordExplorationPasses).values({
            targetId: target.id,
            stopReason: 'lowYield',
            resumeAt: new Date(now.getTime() + day),
        });
        expect((await listDueKeywordScans(now, 10)).map(row => row.id)).toEqual([target.id]);
        expect(await claimKeywordExploration(target.id, now)).toBeNull();
        expect(await listDueKeywordScans(now, 10)).toEqual([]);
    });
});

type PassCase = {
    stop?: string;
    page?: number;
    resume: number;
    claim?: number;
    failures?: number;
};
type Case = {
    term: string;
    tracking?: 'trial' | 'tracked' | 'dropped';
    enabled?: boolean;
    nextCheck?: number;
    pass?: PassCase;
    latest?: PassCase;
};

const insertCase = async (item: Case, created: Date, now: Date) => {
    const at = (ms: number) => new Date(now.getTime() + ms);
    const [query] = await db
        .insert(catalogQueries)
        .values({
            source: 'keepa',
            marketplaceId: 'ATVPDKIKX0DER',
            normalizedTerm: item.term,
            displayTerm: item.term,
        })
        .returning();
    const [target] = await db
        .insert(discoveryTargets)
        .values({
            queryId: query.id,
            kind: 'keyword',
            tracking: item.tracking ?? 'trial',
            enabled: item.enabled ?? true,
            nextCheckAt: item.nextCheck === undefined ? null : at(item.nextCheck),
            createdAt: created,
        })
        .returning();
    const passes = [item.pass, item.latest].flatMap(pass => (pass ? [pass] : []));
    for (const [index, pass] of passes.entries())
        await db.insert(keywordExplorationPasses).values({
            targetId: target.id,
            stopReason: pass.stop ?? 'sourceEnd',
            nextPage: pass.page ?? (pass.stop ? 0 : 1),
            resumeAt: at(pass.resume),
            claimAt: pass.claim === undefined ? null : at(pass.claim),
            claimToken: pass.claim === undefined ? null : randomUUID(),
            failureCount: pass.failures ?? 0,
            createdAt: new Date(created.getTime() + index * minute),
        });
};

// The pre-index listing, kept here as the reference the indexed listing must agree with.
const referenceDue = (now: Date) =>
    db.execute<{ id: string; depth: boolean; tracked: boolean }>(sql`
        select t.id,coalesce(latest.stop_reason in ('running','budget','jobCap')
            and latest.next_page>0,false) depth,t.tracking='tracked' tracked
        from discovery_targets t
        left join lateral (
            select resume_at,claim_at,stop_reason,next_page from keyword_exploration_passes
            where target_id=t.id order by created_at desc,id desc limit 1
        ) latest on true
        where t.enabled and (latest.resume_at is null or (
            (case when latest.stop_reason in ('running','budget','jobCap') then latest.resume_at
                else least(latest.resume_at,coalesce(t.next_check_at,latest.resume_at)) end)
                <=${now.toISOString()}::timestamp
            and (latest.claim_at is null
                or latest.claim_at<=${now.toISOString()}::timestamp-interval '5 minutes')))`);

const expectMatchesClaimRule = async (now: Date) => {
    const sorted = (rows: readonly { id: string; depth: boolean; tracked: boolean }[]) =>
        rows.map(row => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted(await listDueKeywordScans(now, 1000))).toEqual(sorted(await referenceDue(now)));
};

const registerTrial = (
    term: string,
    now: Date,
    kind: 'brandAnalytics' | 'interest' = 'brandAnalytics'
) =>
    db.transaction(tx =>
        recordDiscoveryCandidates(tx, [
            {
                scope: { kind: 'keyword', term },
                evidence: { kind, sourceKey: 'week:x', observedAt: now },
            },
        ])
    );

const targetRow = async (id: string) =>
    (await db.select().from(discoveryTargets).where(eq(discoveryTargets.id, id)))[0];

const termOf = async (targetId: string) =>
    (
        await db
            .select({ term: catalogQueries.normalizedTerm })
            .from(discoveryTargets)
            .innerJoin(catalogQueries, eq(catalogQueries.id, discoveryTargets.queryId))
            .where(eq(discoveryTargets.id, targetId))
    )[0]?.term;
