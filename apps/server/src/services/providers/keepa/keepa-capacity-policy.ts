import type { KeepaWorkClass } from './keepa-capacity-types';

// Keepa refills the bucket every minute and drops tokens older than an hour, so a full bucket wastes
// its refill. Background work may spend down to a reserve kept for live requests; live requests
// spend anything the bucket holds and background yields while one waits.
export interface KeepaCapacityFacts {
    tokensLeft: number;
    productCost: number | null;
    headCost: number | null;
    reservedCost: number;
    reserveTokens: number;
    headRequests: number;
    discoveryRequests: number;
    keywordDiscoveryRequests: number;
    interactiveWaiting: boolean;
}
export const getKeepaReservation = (
    request: {
        operation: 'product' | 'search' | 'category' | 'token';
        workClass: KeepaWorkClass;
        itemCount?: number;
    },
    facts: KeepaCapacityFacts
): { cost: number; reason?: never } | { reason: string; cost?: never } => {
    if (request.operation === 'token') {
        return { cost: 0 };
    }
    const measured = { product: facts.productCost, search: facts.headCost, category: null }[
        request.operation
    ];
    // Unknown operations may only take a bounded interactive pilot; no background guesses.
    if (measured === null && request.workClass !== 'interactive') {
        return { reason: 'unmeasured-cost' };
    }
    const cost = (measured ?? Math.max(10, facts.headCost ?? 10)) * (request.itemCount ?? 1);
    const available = facts.tokensLeft - facts.reservedCost;
    if (available < cost) {
        return { reason: 'bucket' };
    }
    if (request.workClass === 'interactive') {
        return { cost };
    }
    if (facts.interactiveWaiting) {
        return { reason: 'interactive-waiting' };
    }
    if (available - cost < facts.reserveTokens) {
        return { reason: 'live-reserve' };
    }
    if (request.workClass === 'head' && facts.headRequests >= 50) {
        return { reason: 'head-pilot-cap' };
    }
    if (
        request.workClass === 'discovery' &&
        (facts.discoveryRequests >= 20 || facts.keywordDiscoveryRequests >= 10)
    ) {
        return { reason: 'discovery-pilot-cap' };
    }
    return { cost };
};

export const estimateKeepaTokens = (
    state: { tokensLeft: number; refillRate: number; refillInMs: number; observedAt: Date },
    now: Date
) => {
    const elapsed = now.getTime() - state.observedAt.getTime();
    const refills =
        elapsed >= state.refillInMs ? Math.floor((elapsed - state.refillInMs) / 60_000) + 1 : 0;
    return Math.min(
        state.refillRate * 60,
        Math.max(0, state.tokensLeft + refills * state.refillRate)
    );
};
