import { normalizeDiscoveryKeyword } from '@/services/discovery-candidate-policy';
import { notifyKeywordDirectoryRows } from './keyword-directory-notifications';
import { writeKeywordEvents } from './keyword-events';
import {
    KEYWORD_ACCEPT_PROBABILITY,
    KEYWORD_FIT_VERSION,
    KEYWORD_JUDGMENT_BATCH,
} from '@/services/keyword-judgment-contract';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
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
                .map(term => normalizeDiscoveryKeyword(term).toLowerCase())
                .filter(term => term.length > 0 && term.length <= 200)
        ),
    ];
    let rows: { id: string; term: string }[] = [];
    if (terms.length) {
        const added = await tx
            .insert(candidates)
            .values([...terms].sort().map(term => ({ term, marketplaceId })))
            .onConflictDoNothing()
            .returning({ id: candidates.id, term: candidates.term });
        await writeKeywordEvents(
            tx,
            added.map(row => ({ ...row, action: 'keyword.candidate.added', occurredAt: now }))
        );
        rows = await tx
            .select({ id: candidates.id, term: candidates.term })
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
    const ids = new Map(rows.map(row => [row.term, row.id]));
    // Terms keep provider order so a product's selection can prefer earlier recommendations.
    return { terms, ids: terms.flatMap(term => ids.get(term) ?? []) };
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
        .limit(KEYWORD_JUDGMENT_BATCH);
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
    await notifyKeywordDirectoryRows(
        tx,
        rows.map(row => row.term)
    );
    return rows;
};
export const saveKeywordJudgments = async (
    work: { claimToken: string },
    verdicts: readonly { id: string; probability: number }[],
    now = new Date()
) =>
    db.transaction(async tx => {
        if (!verdicts.length) return;
        await lockCandidateJudgments(tx);
        const values = sql.join(
            verdicts.map(({ id, probability }) => sql`(${id}::uuid,${probability}::real)`),
            sql`,`
        );
        const judged = await tx.execute<{ id: string; term: string; probability: number }>(sql`
            update mined_keyword_candidates c set verdict=case when v.probability>=${KEYWORD_ACCEPT_PROBABILITY}
                then 'accepted' else 'rejected' end,probability=v.probability,judge_version=${KEYWORD_FIT_VERSION},
                judged_at=${now.toISOString()}::timestamp,claim_token=null,claim_at=null
            from (values ${values}) v(id,probability)
            where c.id=v.id and c.claim_token=${work.claimToken}::uuid and c.verdict is null
            returning c.id,c.term,v.probability`);
        const saved = new Set(judged.map(row => row.id));
        const missing = verdicts.filter(verdict => !saved.has(verdict.id)).map(row => row.id);
        if (missing.length) {
            const existing = await tx
                .select({ id: candidates.id })
                .from(candidates)
                .where(and(inArray(candidates.id, missing), isNotNull(candidates.verdict)));
            if (existing.length < missing.length) throw new Error('Keyword judgment claim expired');
        }
        await writeKeywordEvents(
            tx,
            [...judged]
                .sort((a, b) => a.id.localeCompare(b.id))
                .map(row => ({
                    id: row.id,
                    term: row.term,
                    action: 'keyword.qualified',
                    occurredAt: now,
                    details: {
                        verdict:
                            row.probability >= KEYWORD_ACCEPT_PROBABILITY ? 'accepted' : 'rejected',
                        probability: row.probability,
                    },
                }))
        );
    });

export const releaseCandidateJudgments = async (tx: Transaction, claimToken: string) => {
    await lockCandidateJudgments(tx);
    const released = await tx
        .update(candidates)
        .set({ claimAt: null, claimToken: null })
        .where(eq(candidates.claimToken, claimToken))
        .returning({ term: candidates.term });
    await notifyKeywordDirectoryRows(
        tx,
        released.map(row => row.term)
    );
};

const lockCandidateJudgments = (tx: Transaction) =>
    tx.execute(sql`select pg_advisory_xact_lock(hashtext('keyword-candidate-judgments'))`);
