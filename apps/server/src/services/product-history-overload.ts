import type { ProductStats } from '@/db/product-stats';

const PAUSE_AFTER_MS = 7 * 86_400_000;

/**
 * Standing history overdue at the last Product count. New admissions pause once the oldest
 * overdue listing is seven days past due; a count minutes old moves that by minutes.
 */
export const getHistoryAdmissionOverload = (
    stats: Pick<ProductStats, 'historyOverdue' | 'historyOldestOverdueAt'>,
    now: Date
) => ({
    overdueCount: stats.historyOverdue,
    oldestOverdueAt: stats.historyOldestOverdueAt,
    newAdmissionsPaused:
        stats.historyOldestOverdueAt !== null &&
        now.getTime() - stats.historyOldestOverdueAt.getTime() >= PAUSE_AFTER_MS,
});
