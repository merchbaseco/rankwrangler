import { checkpointDiscoveryPage } from '@/db/discovery-checkpoint';
import {
    claimKeywordExploration,
    nextDiscoveryWakeAt,
    reserveDiscoveryAttempt,
    stopDiscoveryWork,
} from '@/db/discovery-work';
import { CatalogCapacityDeferredError } from './discovery-types';
import { discoverSpApiKeyword, persistDiscoveredSpApiProducts } from './spapi-keyword-discovery';

const defaultDeps = {
    claim: claimKeywordExploration,
    reserve: reserveDiscoveryAttempt,
    discover: discoverSpApiKeyword,
    persist: persistDiscoveredSpApiProducts,
    checkpoint: checkpointDiscoveryPage,
    stop: stopDiscoveryWork,
    nextWake: nextDiscoveryWakeAt,
};
export const exploreKeywords = async (deps = defaultDeps) => {
    const work = await deps.claim();
    let pages = 0;
    if (!work?.pass.claimToken)
        return { kind: 'idle' as const, didWork: false, pages, nextWakeAt: await deps.nextWake() };
    const claimToken = work.pass.claimToken;
    let pass = work.pass;
    let attemptId: string | null = null;
    try {
        while (pages < 5) {
            attemptId = await deps.reserve({ passId: pass.id, claimToken, page: pass.nextPage });
            if (!attemptId)
                return {
                    kind: 'lostClaim' as const,
                    didWork: pages > 0,
                    pages,
                    nextWakeAt: await deps.nextWake(),
                };
            const page = await deps.discover({
                scope: work.scope,
                marketplaceId: work.marketplaceId,
                pageToken: pass.nextPageToken ?? undefined,
                workId: attemptId,
            });
            pass = await deps.checkpoint({
                passId: pass.id,
                claimToken,
                attemptId,
                page: pass.nextPage,
                nextPageToken: page.nextPageToken,
                observedAt: page.observedAt,
                products: page.products,
                persist: deps.persist,
            });
            pages += 1;
            if (pass.stopReason !== 'running') {
                await deps.stop({ passId: pass.id, claimToken, reason: 'complete' });
                return {
                    kind: 'complete' as const,
                    didWork: true,
                    pages,
                    nextWakeAt: await deps.nextWake(),
                };
            }
        }
        await deps.stop({ passId: pass.id, claimToken, reason: 'jobCap' });
        return {
            kind: 'yielded' as const,
            didWork: true,
            pages,
            nextWakeAt: await deps.nextWake(),
        };
    } catch (error) {
        if (error instanceof CatalogCapacityDeferredError) {
            await deps.stop({
                passId: pass.id,
                claimToken,
                attemptId: attemptId ?? undefined,
                reason: 'budget',
                retryAt: error.retryAt,
            });
            return {
                kind: 'deferred' as const,
                didWork: pages > 0,
                pages,
                nextWakeAt: await deps.nextWake(),
            };
        }
        await deps.stop({
            passId: pass.id,
            claimToken,
            attemptId: attemptId ?? undefined,
            reason: 'failure',
        });
        return {
            kind: 'failed' as const,
            error,
            didWork: pages > 0,
            pages,
            nextWakeAt: await deps.nextWake(),
        };
    }
};
