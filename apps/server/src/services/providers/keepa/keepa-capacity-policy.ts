import type { KeepaWorkClass } from './keepa-capacity-types';

const SHARES: Record<KeepaWorkClass, number> = {
    interactive: 0.2,
    history: 0.5,
    head: 0.2,
    discovery: 0.1,
};
export interface KeepaCapacityFacts {
    tokensLeft: number;
    refillRate: number;
    productCost: number | null;
    headCost: number | null;
    reservedCost: number;
    spent: Record<KeepaWorkClass, number>;
    headRequests: number;
    discoveryRequests: number;
    keywordDiscoveryRequests: number;
    historyDue: boolean;
    headDue: boolean;
    interactiveWaiting: boolean;
}
export const getKeepaReservation = (
    request: { operation: 'product' | 'search' | 'category' | 'token'; workClass: KeepaWorkClass },
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
    const cost = measured ?? Math.max(10, facts.headCost ?? 10);
    const available = facts.tokensLeft - facts.reservedCost;
    if (available < cost) {
        return { reason: 'bucket' };
    }
    // Someone is waiting on interactive work: only the physical bucket limits it, and background
    // work yields until it is served.
    if (request.workClass === 'interactive') {
        return { cost };
    }
    if (facts.interactiveWaiting) {
        return { reason: 'interactive-waiting' };
    }
    const floor =
        facts.productCost !== null && facts.headCost !== null
            ? facts.headCost + 10 * facts.productCost
            : null;
    if (floor === null || available - cost < floor) {
        return { reason: 'interactive-floor' };
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
    const budget = facts.refillRate * 60;
    const allowance = getClassAllowance(request.workClass, facts, floor, available - cost);
    const totalSpent = Object.values(facts.spent).reduce((sum, value) => sum + value, 0);
    if (facts.spent[request.workClass] + cost > allowance || totalSpent + cost > budget) {
        return { reason: 'rolling-share' };
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

const getClassAllowance = (
    workClass: KeepaWorkClass,
    facts: KeepaCapacityFacts,
    floor: number | null,
    postBalance: number
) => {
    const budget = facts.refillRate * 60;
    let allowance = budget * SHARES[workClass];
    if (workClass === 'head' && !facts.historyDue) {
        allowance += Math.max(0, budget * SHARES.history - facts.spent.history);
    }
    if (workClass === 'history' && !facts.headDue) {
        allowance += Math.max(0, budget * SHARES.head - facts.spent.head);
    }
    if (
        (workClass === 'head' || workClass === 'history') &&
        floor !== null &&
        postBalance >= 2 * floor
    ) {
        allowance += Math.max(0, budget * SHARES.interactive - facts.spent.interactive);
    }
    return allowance;
};
