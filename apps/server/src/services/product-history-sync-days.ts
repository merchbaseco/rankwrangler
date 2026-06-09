const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_KEEPA_HISTORY_DAYS = 30;
const MAX_KEEPA_HISTORY_DAYS = 3650;

export const resolveProductHistorySyncDays = (
    input: { startAt?: Date; days: number },
    agentWindow: { startAt: Date; endAt: Date } | null = null,
    now = new Date()
) => {
    const startAt = agentWindow?.startAt ?? input.startAt;
    if (!startAt) {
        return clampKeepaHistoryDays(input.days);
    }

    const ageDays = Math.ceil((now.getTime() - startAt.getTime()) / DAY_MS);
    return clampKeepaHistoryDays(Math.max(input.days, ageDays));
};

const clampKeepaHistoryDays = (days: number) => {
    return Math.min(
        MAX_KEEPA_HISTORY_DAYS,
        Math.max(MIN_KEEPA_HISTORY_DAYS, Math.ceil(days))
    );
};
