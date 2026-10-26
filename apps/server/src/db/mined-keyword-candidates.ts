import { writeKeywordEvents } from './keyword-events';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './index';
import { minedKeywordCandidates as candidates } from './keyword-mining-schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const saveCandidateTerms = async (
    tx: Transaction,
    marketplaceId: string,
    phrases: string[],
    now: Date
) => {
    await lockCandidateJudgments(tx);
    const terms = [
        ...new Set(
            phrases
                .map(term => term.trim().replace(/\s+/gu, ' ').toLowerCase())
                .filter(term => term.length > 0 && term.length <= 200)
        ),
    ].sort();
    let rows: { id: string }[] = [];
    if (terms.length) {
        const added = await tx
            .insert(candidates)
            .values(terms.map(term => ({ term, marketplaceId })))
            .onConflictDoNothing()
            .returning({ id: candidates.id, term: candidates.term });
        await writeKeywordEvents(
            tx,
            added.map(row => ({ ...row, action: 'keyword.candidate.added', occurredAt: now }))
        );
        rows = await tx
            .select({ id: candidates.id })
            .from(candidates)
            .where(
                and(eq(candidates.marketplaceId, marketplaceId), inArray(candidates.term, terms))
            );
        await tx.execute(sql`update mined_keyword_candidates c set verdict='accepted',judged_at=${now.toISOString()}::timestamp,
            judge_version='already-tracked',probability=null where c.marketplace_id=${marketplaceId}
            and c.term in (${sql.join(
                terms.map(term => sql`${term}`),
                sql`,`
            )}) and c.verdict is null and c.claim_token is null and exists
            (select 1 from catalog_queries q join discovery_targets t on t.query_id=q.id where q.normalized_term=c.term
                and q.marketplace_id=c.marketplace_id and t.kind='keyword' and t.tracking='tracked')`);
    }
    return { terms, ids: rows.map(row => row.id) };
};
export const claimCandidateJudgments = async (
    tx: Transaction,
    claimToken: string,
    ids: string[],
    now: Date
) => {
    if (!ids.length) return [];
    await lockCandidateJudgments(tx);
    const rows = await tx
        .select({ id: candidates.id, term: candidates.term })
        .from(candidates)
        .where(
            and(
                inArray(candidates.id, ids),
                isNull(candidates.verdict),
                sql`(${candidates.claimAt} is null or ${candidates.claimAt}<${new Date(now.getTime() - 300_000).toISOString()}::timestamp)`
            )
        )
        .orderBy(candidates.id)
        .limit(25);
    if (rows.length)
        await tx
            .update(candidates)
            .set({ claimToken, claimAt: now })
            .where(
                inArray(
                    candidates.id,
                    rows.map(row => row.id)
                )
            );
    return rows;
};
export const saveKeywordJudgments = async (
    work: { claimToken: string },
    verdicts: { id: string; probability: number }[],
    now = new Date()
) =>
    db.transaction(async tx => {
        await lockCandidateJudgments(tx);
        for (const verdict of [...verdicts].sort((a, b) => a.id.localeCompare(b.id))) {
            const result = await tx
                .update(candidates)
                .set({
                    verdict: verdict.probability >= 0.8 ? 'accepted' : 'rejected',
                    probability: verdict.probability,
                    judgeVersion: 'jev-1.13.0:merch-buyer-search-v1',
                    judgedAt: now,
                    claimToken: null,
                    claimAt: null,
                })
                .where(
                    and(
                        eq(candidates.id, verdict.id),
                        eq(candidates.claimToken, work.claimToken),
                        isNull(candidates.verdict)
                    )
                )
                .returning({ id: candidates.id, term: candidates.term });
            if (result.length)
                await writeKeywordEvents(
                    tx,
                    result.map(row => ({
                        ...row,
                        action: 'keyword.qualified',
                        occurredAt: now,
                        details: {
                            verdict: verdict.probability >= 0.8 ? 'accepted' : 'rejected',
                            probability: verdict.probability,
                        },
                    }))
                );
            if (!result.length) {
                const [existing] = await tx
                    .select({ verdict: candidates.verdict })
                    .from(candidates)
                    .where(eq(candidates.id, verdict.id));
                if (!existing?.verdict) throw new Error('Keyword judgment claim expired');
            }
        }
    });

export const releaseCandidateJudgments = async (tx: Transaction, claimToken: string) => {
    await lockCandidateJudgments(tx);
    await tx
        .update(candidates)
        .set({ claimAt: null, claimToken: null })
        .where(eq(candidates.claimToken, claimToken));
};

const lockCandidateJudgments = (tx: Transaction) =>
    tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-candidate-judgments'))`);
