import type { ProductStats } from '@/db/product-stats';

const PAUSE_AFTER_MS = 7 * 86_400_000;
// A handful of stuck identities should not freeze history admission for the whole catalog;
// pause only once a real backlog has accumulated alongside a seven-day oldest overdue item.
export const KEEPA_ADMISSION_OVERLOAD_MIN_OVERDUE = 100;

/**
 * Standing history overdue at the last Product count. New admissions pause once at least
 * `KEEPA_ADMISSION_OVERLOAD_MIN_OVERDUE` listings are overdue and the oldest is seven days past
 * due; `oldestOverdueAt` stays exposed so operators can still spot isolated stuck rows.
 */
export const getHistoryAdmissionOverload = (
    stats: Pick<ProductStats, 'historyOverdue' | 'historyOldestOverdueAt'>,
    now: Date
) => ({
    overdueCount: stats.historyOverdue,
    oldestOverdueAt: stats.historyOldestOverdueAt,
    newAdmissionsPaused:
        stats.historyOverdue >= KEEPA_ADMISSION_OVERLOAD_MIN_OVERDUE &&
        stats.historyOldestOverdueAt !== null &&
        now.getTime() - stats.historyOldestOverdueAt.getTime() >= PAUSE_AFTER_MS,
});
