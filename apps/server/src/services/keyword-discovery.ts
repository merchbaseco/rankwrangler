import { checkpointDiscoveryPage } from '@/db/discovery-checkpoint';
import {
    claimKeywordExploration,
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
};

// One SP-API page for one keyword target. `continues` means the pass has another page ready; the
// scan job then queues that page behind due heads instead of fetching it now.
export const scanKeywordPage = async (targetId: string, deps = defaultDeps) => {
    const work = await deps.claim(new Date(), { targetId });
    if (!work?.pass.claimToken) return { kind: 'notDue' as const, didWork: false };
    const claimToken = work.pass.claimToken;
    const pass = work.pass;
    const term = work.scope.term;
    const page = pass.nextPage;
    let attemptId: string | null = null;
    try {
        attemptId = await deps.reserve({ passId: pass.id, claimToken, page });
        if (!attemptId) return { kind: 'lostClaim' as const, didWork: false, term, page };
        const result = await deps.discover({
            scope: work.scope,
            marketplaceId: work.marketplaceId,
            pageToken: pass.nextPageToken ?? undefined,
            workId: attemptId,
        });
        const next = await deps.checkpoint({
            passId: pass.id,
            claimToken,
            attemptId,
            page,
            nextPageToken: result.nextPageToken,
            observedAt: result.observedAt,
            products: result.products,
            persist: deps.persist,
        });
        const continues = next.stopReason === 'running';
        await deps.stop({ passId: pass.id, claimToken, reason: continues ? 'jobCap' : 'complete' });
        return {
            kind: 'scanned' as const,
            didWork: true,
            term,
            page,
            products: result.products.length,
            stopReason: next.stopReason,
            continues,
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
            return { kind: 'waiting' as const, didWork: false, term, page, retryAt: error.retryAt };
        }
        await deps.stop({
            passId: pass.id,
            claimToken,
            attemptId: attemptId ?? undefined,
            reason: 'failure',
        });
        throw error;
    }
};
