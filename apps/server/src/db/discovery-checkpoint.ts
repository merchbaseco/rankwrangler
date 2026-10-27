import { notifyKeywordQueryRows } from './keyword-directory-notifications';
import { writeKeywordEvents } from './keyword-events';
import { observeKeywordStanding } from './keyword-standing';
import { and, eq } from 'drizzle-orm';
import { explorationCheckpoint, KEYWORD_DAY_MS } from '@/services/keyword-collection-policy';
import type { persistDiscoveredSpApiProducts } from '@/services/spapi-keyword-discovery';
import { catalogQueries } from './catalog-search-schema';
import { lockCatalogQueryForReconciliation } from './catalog-query-resolution';
import { recordDiscoveryMembership } from './discovery-membership';
import { discoveryTargets } from './discovery-target-schema';
import { db } from './index';
import { keywordDiscoveryAttempts, keywordExplorationPasses } from './keyword-collection-schema';

export const checkpointDiscoveryPage = async <T>(input: {
    passId: string;
    claimToken: string;
    attemptId: string;
    page: number;
    nextPageToken: string | null;
    observedAt: Date;
    products: T[];
    persist: (
        tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
        products: T[]
    ) => ReturnType<typeof persistDiscoveredSpApiProducts>;
}) =>
    db.transaction(async tx => {
        const [pass] = await tx
            .select()
            .from(keywordExplorationPasses)
            .where(
                and(
                    eq(keywordExplorationPasses.id, input.passId),
                    eq(keywordExplorationPasses.claimToken, input.claimToken)
                )
            )
            .for('update');
        if (!pass) throw new Error('Discovery execution ownership expired');
        const [attempt] = await tx
            .select()
            .from(keywordDiscoveryAttempts)
            .where(
                and(
                    eq(keywordDiscoveryAttempts.id, input.attemptId),
                    eq(keywordDiscoveryAttempts.passId, pass.id),
                    eq(keywordDiscoveryAttempts.claimToken, input.claimToken),
                    eq(keywordDiscoveryAttempts.page, input.page)
                )
            )
            .for('update');
        if (attempt?.status === 'accepted') return pass;
        if (pass.nextPage !== input.page || attempt?.status !== 'fetched')
            throw new Error('Discovery page is not ready for acceptance');
        const [target] = await tx
            .select()
            .from(discoveryTargets)
            .where(eq(discoveryTargets.id, pass.targetId));
        if (!target) throw new Error('Discovery target disappeared');
        if (target.kind === 'keyword') await lockCatalogQueryForReconciliation(tx, target.queryId);
        const persisted = await input.persist(tx, input.products);
        const newMerchCount = await recordDiscoveryMembership(tx, {
            target,
            ...persisted,
            observedAt: input.observedAt,
        });
        if (target.kind === 'keyword' && persisted.merchProductIds.length) {
            await tx
                .update(catalogQueries)
                .set({ merchObservedAt: input.observedAt, updatedAt: input.observedAt })
                .where(eq(catalogQueries.id, target.queryId));
        }
        const nextCheckAt =
            input.page === 0 && target.kind === 'keyword'
                ? await observeKeywordStanding(tx, {
                      target,
                      productIds: persisted.productIds,
                      resultCount: input.products.length,
                      now: input.observedAt,
                  })
                : target.nextCheckAt;
        const checkpoint = explorationCheckpoint({
            ...pass,
            page: input.page,
            newMerchCount: persisted.newMerchProductIds.length,
            resultCount: input.products.length,
        });
        const fingerprint = [...persisted.productIds].sort().join(',');
        if (
            (input.page > 0 && pass.lastPageFingerprint === fingerprint && fingerprint) ||
            (input.nextPageToken && input.nextPageToken === pass.nextPageToken)
        ) {
            checkpoint.stopReason = 'providerLimit';
            checkpoint.contiguousPages = pass.contiguousPages;
        }
        if (!input.nextPageToken) checkpoint.stopReason = 'sourceEnd';
        const firstEmpty = input.page === 0 && input.products.length === 0;
        const emptyCount =
            input.page === 0 ? (firstEmpty ? target.emptyCount + 1 : 0) : target.emptyCount;
        if (input.page === 0)
            await tx
                .update(discoveryTargets)
                .set({ emptyCount })
                .where(eq(discoveryTargets.id, target.id));
        const [next] = await tx
            .update(keywordExplorationPasses)
            .set({
                ...checkpoint,
                nextPageToken: input.nextPageToken,
                lastPageFingerprint: fingerprint,
                oldestPageAt: pass.oldestPageAt ?? input.observedAt,
                lastPageAt: input.observedAt,
                failureCount: 0,
                updatedAt: input.observedAt,
                resumeAt:
                    checkpoint.stopReason === 'running'
                        ? input.observedAt
                        : (nextCheckAt ??
                          new Date(
                              input.observedAt.getTime() +
                                  (firstEmpty ? (emptyCount === 1 ? 7 : 30) : 30) * KEYWORD_DAY_MS
                          )),
            })
            .where(eq(keywordExplorationPasses.id, pass.id))
            .returning();
        await tx
            .update(keywordDiscoveryAttempts)
            .set({
                status: 'accepted',
                finishedAt: input.observedAt,
                resultCount: input.products.length,
                newProducts: persisted.newProductIds.length,
                newMerchProducts: persisted.newMerchProductIds.length,
                knownMerch: persisted.merchProductIds.length,
                unknownProducts: persisted.unknownCount,
                nonMerchProducts: persisted.nonMerchCount,
                newMerchMemberships: newMerchCount,
            })
            .where(eq(keywordDiscoveryAttempts.id, attempt.id));
        if (target.kind === 'keyword') {
            const [query] = await tx
                .select({ term: catalogQueries.normalizedTerm })
                .from(catalogQueries)
                .where(eq(catalogQueries.id, target.queryId));
            await writeKeywordEvents(tx, [
                {
                    id: target.queryId,
                    term: query.term,
                    action: 'keyword.products.mined',
                    occurredAt: input.observedAt,
                    details: {
                        passId: pass.id,
                        page: input.page,
                        products: input.products.length,
                        merch: persisted.merchProductIds.length,
                        newProducts: persisted.newProductIds.length,
                        newMerch: persisted.newMerchProductIds.length,
                        stopReason: next.stopReason,
                        nextCheckAt: next.resumeAt.toISOString(),
                    },
                },
            ]);
        }
        await notifyKeywordQueryRows(tx, [target.queryId]);
        return next;
    });
