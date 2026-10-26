import { isAutomaticSyncPaused } from './automatic-sync';
import {
    saveCandidateTerms,
    claimCandidateJudgments,
    releaseCandidateJudgments,
} from './mined-keyword-candidates';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { products } from './product-schema';
import {
    productKeywordMining as mining,
    minedKeywordCandidates as candidates,
    productKeywordCandidates as links,
} from './keyword-mining-schema';
import { recordDiscoveryCandidates } from './discovery-candidates';
import { keywordRetryAt } from '@/services/keyword-collection-policy';

export const claimProductKeywordMining = async (now = new Date()) =>
    db.transaction(async tx => {
        if (await isAutomaticSyncPaused(tx)) return null;
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('product-keyword-mining'))`);
        const [existing] = await tx
            .select({ mining, product: products })
            .from(mining)
            .innerJoin(products, eq(products.id, mining.productId))
            .where(
                and(
                    eq(products.marketplaceId, 'ATVPDKIKX0DER'),
                    eq(products.isMerchListing, true),
                    eq(products.amazonListingStatus, 'active'),
                    sql`${mining.stage}<>'complete'`,
                    sql`${mining.nextDueAt}<=${now.toISOString()}::timestamp`,
                    sql`(${mining.claimAt} is null or ${mining.claimAt}<${new Date(now.getTime() - 300_000).toISOString()}::timestamp)`
                )
            )
            .orderBy(mining.nextDueAt, mining.productId)
            .limit(1)
            .for('update', { of: mining });
        let product = existing?.product;
        if (!product) {
            [product] = await tx
                .select()
                .from(products)
                .where(
                    and(
                        eq(products.marketplaceId, 'ATVPDKIKX0DER'),
                        eq(products.isMerchListing, true),
                        eq(products.amazonListingStatus, 'active'),
                        sql`not exists(select 1 from product_keyword_mining m where m.product_id=${products.id})`,
                        sql`not exists(select 1 from official_brands b where b.marketplace_id=${products.marketplaceId}
                and b.normalized_brand=lower(btrim(regexp_replace(${products.brand},'[[:space:]]+',' ','g'))))`
                    )
                )
                .orderBy(
                    sql`${products.rootCategoryBsr} asc nulls last`,
                    products.createdAt,
                    products.id
                )
                .limit(1);
            if (!product) return null;
            await tx
                .insert(mining)
                .values({ productId: product.id, nextDueAt: now, createdAt: now })
                .onConflictDoNothing();
        }
        const [claimed] = await tx
            .update(mining)
            .set({ claimToken: randomUUID(), claimAt: now })
            .where(eq(mining.productId, product.id))
            .returning();
        return { product, ...claimed, claimToken: claimed.claimToken! };
    });
export type MiningWork = NonNullable<Awaited<ReturnType<typeof claimProductKeywordMining>>>;

export const saveKeywordRecommendations = async (
    work: MiningWork,
    phrases: string[],
    now = new Date()
) =>
    db.transaction(async tx => {
        const [owned] = await tx
            .select()
            .from(mining)
            .where(
                and(eq(mining.productId, work.productId), eq(mining.claimToken, work.claimToken))
            )
            .for('update');
        if (!owned) throw new Error('Product mining claim expired');
        if (owned.stage !== 'pending') return;
        const { terms, ids } = await saveCandidateTerms(
            tx,
            work.product.marketplaceId,
            phrases,
            now
        );
        if (ids.length)
            await tx
                .insert(links)
                .values(ids.map(candidateId => ({ productId: work.productId, candidateId })))
                .onConflictDoNothing();
        await tx
            .update(mining)
            .set({
                stage: 'recommendationsSaved',
                recommendations: terms,
                recommendedAt: now,
                failureCount: 0,
            })
            .where(eq(mining.productId, work.productId));
    });

export const claimKeywordJudgments = async (work: MiningWork, now = new Date()) =>
    db.transaction(async tx => {
        const [owner] = await tx
            .select()
            .from(mining)
            .where(
                and(eq(mining.productId, work.productId), eq(mining.claimToken, work.claimToken))
            )
            .for('update');
        if (!owner || owner.stage !== 'recommendationsSaved')
            throw new Error('Product mining claim expired');
        const rows = await tx
            .select({ id: links.candidateId })
            .from(links)
            .where(eq(links.productId, work.productId));
        return claimCandidateJudgments(
            tx,
            work.claimToken,
            rows.map(row => row.id),
            now
        );
    });

export const finishProductKeywordMining = async (work: MiningWork, now = new Date()) =>
    db.transaction(async tx => {
        const [owned] = await tx
            .select()
            .from(mining)
            .where(
                and(eq(mining.productId, work.productId), eq(mining.claimToken, work.claimToken))
            )
            .for('update');
        if (!owned || owned.stage !== 'recommendationsSaved') return false;
        const rows = await tx
            .select({ candidate: candidates })
            .from(links)
            .innerJoin(candidates, eq(candidates.id, links.candidateId))
            .where(eq(links.productId, work.productId));
        if (rows.some(row => row.candidate.verdict === null)) return false;
        await recordDiscoveryCandidates(
            tx,
            rows
                .filter(row => row.candidate.verdict === 'accepted')
                .map(({ candidate }) => ({
                    scope: { kind: 'keyword' as const, term: candidate.term },
                    evidence: {
                        kind: 'adsRecommendation' as const,
                        sourceKey: work.product.asin,
                        productId: work.productId,
                        observedAt: owned.recommendedAt ?? now,
                    },
                }))
        );
        await tx
            .update(mining)
            .set({
                stage: 'complete',
                completedAt: now,
                claimAt: null,
                claimToken: null,
                failureCount: 0,
            })
            .where(eq(mining.productId, work.productId));
        return true;
    });

export const releaseProductKeywordMining = async (
    work: MiningWork,
    input: { retryAt?: Date; failed?: boolean; now?: Date } = {}
) =>
    db.transaction(async tx => {
        const now = input.now ?? new Date();
        await tx
            .update(mining)
            .set({
                claimAt: null,
                claimToken: null,
                nextDueAt:
                    input.retryAt ?? (input.failed ? keywordRetryAt(work.failureCount, now) : now),
                failureCount: work.failureCount + (input.failed ? 1 : 0),
            })
            .where(
                and(eq(mining.productId, work.productId), eq(mining.claimToken, work.claimToken))
            );
        await releaseCandidateJudgments(tx, work.claimToken);
    });
