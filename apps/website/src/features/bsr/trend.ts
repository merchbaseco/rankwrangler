/** A signed move as a TrendChip direction: positive is up (better), zero neutral. */
export const trendOf = (move: number) => {
    if (move > 0) {
        return 'up' as const;
    }
    return move < 0 ? ('down' as const) : ('neutral' as const);
};
