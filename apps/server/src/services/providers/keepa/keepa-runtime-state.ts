export const estimateTokensLeft = (state: {
    tokensLeft: number | null;
    refillRate: number | null;
    refillInMs: number | null;
    updatedAt: Date | null;
}) => {
    if (state.tokensLeft === null || state.refillRate === null || !state.updatedAt) {
        return state.tokensLeft;
    }
    const elapsedMs = Date.now() - state.updatedAt.getTime();
    const delay = Math.max(0, state.refillInMs ?? 60_000);
    const refills = elapsedMs >= delay ? Math.floor((elapsedMs - delay) / 60_000) + 1 : 0;
    return Math.min(state.refillRate * 60, state.tokensLeft + refills * state.refillRate);
};
