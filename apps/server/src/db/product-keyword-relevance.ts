import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { KEYWORD_JUDGMENT_BATCH } from '@/services/keyword-judgment-contract';
import { db } from './index';
import {
    productKeywordMining as mining,
    minedKeywordCandidates as candidates,
    productKeywordCandidates as links,
} from './keyword-mining-schema';
import type { MiningWork } from './keyword-mining-work';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Topical relevance belongs to one product's link, never to the global candidate: a phrase that
// is irrelevant to a cat shirt can still be the right root for another product.
export const claimRelevanceCandidates = async (work: MiningWork) =>
    db.transaction(async tx => {
        await lockOwnedMining(tx, work);
        return tx
            .select({ id: links.candidateId, term: candidates.term })
            .from(links)
            .innerJoin(candidates, eq(candidates.id, links.candidateId))
            .where(
                and(
                    eq(links.productId, work.productId),
                    eq(candidates.verdict, 'accepted'),
                    isNull(links.relevance)
                )
            )
            .orderBy(sql`${links.position} asc nulls last`, asc(candidates.term))
            .limit(KEYWORD_JUDGMENT_BATCH);
    });

export const saveProductRelevance = async (
    work: MiningWork,
    verdicts: readonly { id: string; probability: number }[]
) =>
    db.transaction(async tx => {
        if (!verdicts.length) return;
        await lockOwnedMining(tx, work);
        const values = sql.join(
            verdicts.map(({ id, probability }) => sql`(${id}::uuid,${probability}::real)`),
            sql`,`
        );
        await tx.execute(sql`
            update product_keyword_candidates l set relevance=v.probability
            from (values ${values}) v(id,probability)
            where l.product_id=${work.productId}::uuid and l.candidate_id=v.id`);
    });

const lockOwnedMining = async (tx: Transaction, work: MiningWork) => {
    const [owned] = await tx
        .select({ stage: mining.stage })
        .from(mining)
        .where(and(eq(mining.productId, work.productId), eq(mining.claimToken, work.claimToken)))
        .for('update');
    if (owned?.stage !== 'recommendationsSaved') throw new Error('Product mining claim expired');
};
