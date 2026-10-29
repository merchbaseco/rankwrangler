// A history fetch measures one token. Each run spends what sits above the live reserve, so a full
// bucket drains instead of wasting refill at its cap, and the pace settles at the refill once
// drained. The durable reservation still enforces the reserve.
const KEEPA_TOKENS_PER_HISTORY_FETCH = 1;
// Keepa would take a whole bucket at once; this bounds how many products we save per run so a
// run finishes well inside the dispatch hold. Three requests of up to 100 products each.
const KEEPA_MAX_HISTORY_DISPATCH_PER_RUN = 300;
export const KEEPA_HISTORY_REQUEST_BATCH_SIZE = 100;

export const getKeepaHistoryDispatchBatchSize = ({
    tokensLeft,
    reserveTokens,
}: {
    tokensLeft: number;
    reserveTokens: number;
}) => {
    const spendable = Math.max(0, tokensLeft - reserveTokens);
    return Math.min(
        Math.trunc(spendable / KEEPA_TOKENS_PER_HISTORY_FETCH),
        KEEPA_MAX_HISTORY_DISPATCH_PER_RUN
    );
};
