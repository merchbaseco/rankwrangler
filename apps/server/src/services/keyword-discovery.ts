import {
    checkpointDiscoveryPage,
    claimKeywordExploration,
    reserveDiscoveryAttempt,
    stopDiscoveryWork,
} from '@/db/keyword-discovery';
import { discoverSpApiKeyword, persistDiscoveredSpApiProducts } from './spapi-keyword-discovery';

const defaultDeps = {
    claim: claimKeywordExploration,
    reserve: reserveDiscoveryAttempt,
    discover: discoverSpApiKeyword,
    persist: persistDiscoveredSpApiProducts,
    checkpoint: checkpointDiscoveryPage,
    stop: stopDiscoveryWork,
};
export const exploreKeywords = async (deps = defaultDeps) => {
    const work = await deps.claim();
    if (!work?.pass.claimAt) return { didWork: false, requests: 0 };
    const claimAt = work.pass.claimAt;
    let pass = work.pass;
    let requests = 0;
    try {
        while (requests < 5) {
            const attemptId = await deps.reserve({
                passId: pass.id,
                queryId: pass.queryId,
                page: pass.nextPage,
                claimAt,
            });
            if (!attemptId) {
                await deps.stop({ passId: pass.id, claimAt, reason: 'budget' });
                return { didWork: requests > 0, requests };
            }
            requests += 1;
            const page = await deps.discover({
                term: work.term,
                marketplaceId: 'ATVPDKIKX0DER',
                pageToken: pass.nextPageToken ?? undefined,
                workId: attemptId,
                queryId: pass.queryId,
            });
            const next = await deps.checkpoint({
                passId: pass.id,
                claimAt,
                attemptId,
                page: pass.nextPage,
                nextPageToken: page.nextPageToken,
                observedAt: page.observedAt,
                products: page.products,
                persist: deps.persist,
            });
            if (!next) throw new Error('Discovery checkpoint disappeared.');
            pass = next;
            if (pass.stopReason !== 'running') {
                await deps.stop({ passId: pass.id, claimAt, reason: 'complete' });
                return { didWork: true, requests };
            }
        }
        await deps.stop({ passId: pass.id, claimAt, reason: 'jobCap' });
        return { didWork: true, requests };
    } catch (error) {
        await deps.stop({ passId: pass.id, claimAt, reason: 'failure' });
        throw error;
    }
};
