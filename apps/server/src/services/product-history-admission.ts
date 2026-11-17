import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { lockHistoryAdmission, readProductStats } from '@/db/product-stats';
import { products } from '@/db/schema';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
} from '@/services/keepa-refresh-policy';
import { getHistoryAdmissionOverload } from '@/services/product-history-overload';

// Counts are refreshed every five minutes; past half an hour the refresh job is failing, and
// admission waits rather than plan on a population it can no longer vouch for.
export const PRODUCT_STATS_MAX_AGE_MS = 30 * 60_000;
const weeklyThreshold = sql.raw(String(KEEPA_WEEKLY_AUTO_BSR_THRESHOLD));

type HistoryAdmissionCapacity = Readonly<{ refillRate: number; productCost: number }>;
type Cadence = 'twiceDaily' | 'daily' | 'weekly';

export const getHistoryAdmissionForecast = ({
    twiceDaily,
    daily,
    weekly,
    productCost,
    refillRate,
}: {
    twiceDaily: number;
    daily: number;
    weekly: number;
    productCost: number;
    refillRate: number;
}) => ({
    projectedDailyTokens: (twiceDaily * 2 + daily + weekly / 7) * productCost,
    // Scheduled refreshes may plan on 90% of the daily refill; the rest covers live requests,
    // first-time history and keyword searches.
    protectedDailyTokens: refillRate * 60 * 24 * 0.9,
});

/**
 * Admits the best-BSR waiting listings while forecast refresh spend stays under the protected
 * refill. The standing population comes from the Product count plus every admission made since
 * (this job adds its own under the shared lock), so it is exact for admissions and minutes stale
 * only for BSR and listing changes, well inside the 10% margin.
 */
export const admitProductHistory = async (
    capacity: HistoryAdmissionCapacity | null,
    now = new Date()
) => {
    if (
        !capacity ||
        !Number.isFinite(capacity.refillRate) ||
        capacity.refillRate <= 0 ||
        !Number.isFinite(capacity.productCost) ||
        capacity.productCost <= 0
    ) {
        return { admitted: 0, paused: 0, reason: 'capacity_unknown' } as const;
    }
    return db.transaction(async tx => {
        await lockHistoryAdmission(tx);
        const stats = await readProductStats(tx);
        if (!stats || now.getTime() - stats.observedAt.getTime() > PRODUCT_STATS_MAX_AGE_MS) {
            return { admitted: 0, paused: 0, reason: 'counts_unknown' } as const;
        }
        const overload = getHistoryAdmissionOverload(stats, now);
        const forecast = getHistoryAdmissionForecast({
            twiceDaily: stats.historyTwiceDaily,
            daily: stats.historyDaily,
            weekly: stats.historyWeekly,
            ...capacity,
        });
        // Literal predicates, so the planner proves the partial candidate index applies.
        const candidates = await tx
            .select({ id: products.id, bsr: products.rootCategoryBsr })
            .from(products)
            .where(sql`${products.historyAdmissionState} <> 'admitted'
                and ${products.amazonListingStatus} = 'active' and ${products.isMerchListing}
                and ${products.rootCategoryBsr} < ${weeklyThreshold}`)
            .orderBy(asc(products.rootCategoryBsr), asc(products.createdAt), asc(products.id))
            .limit(100)
            .for('update');
        let projectedDailyTokens = forecast.projectedDailyTokens;
        const admittedBy: Record<Cadence, number> = { twiceDaily: 0, daily: 0, weekly: 0 };
        let paused = 0;
        for (const candidate of candidates) {
            const cadence = cadenceOf(candidate.bsr ?? Number.POSITIVE_INFINITY);
            const cost = capacity.productCost * { twiceDaily: 2, daily: 1, weekly: 1 / 7 }[cadence];
            const canAdmit =
                !overload.newAdmissionsPaused &&
                projectedDailyTokens + cost < forecast.protectedDailyTokens;
            await tx
                .update(products)
                .set(
                    canAdmit
                        ? {
                              historyAdmissionState: 'admitted',
                              historyAdmissionReason: 'capacity',
                              historyAdmittedAt: new Date(),
                          }
                        : {
                              historyAdmissionState: 'paused',
                              historyAdmissionReason: 'capacity',
                          }
                )
                .where(eq(products.id, candidate.id));
            if (canAdmit) {
                projectedDailyTokens += cost;
                admittedBy[cadence]++;
            } else {
                paused++;
            }
        }
        const admitted = admittedBy.twiceDaily + admittedBy.daily + admittedBy.weekly;
        if (admitted > 0) {
            await tx.execute(sql`update product_stats set
                history_twice_daily=history_twice_daily+${admittedBy.twiceDaily},
                history_daily=history_daily+${admittedBy.daily},
                history_weekly=history_weekly+${admittedBy.weekly}`);
        }
        return {
            admitted,
            paused,
            overdueCount: overload.overdueCount,
            projectedDailyTokens,
            protectedDailyTokens: forecast.protectedDailyTokens,
            reason: 'evaluated',
        } as const;
    });
};

const cadenceOf = (bsr: number): Cadence =>
    bsr < KEEPA_TWICE_DAILY_AUTO_BSR_THRESHOLD
        ? 'twiceDaily'
        : bsr < KEEPA_DAILY_AUTO_BSR_THRESHOLD
          ? 'daily'
          : 'weekly';
