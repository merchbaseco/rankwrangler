import { and, asc, eq, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { products } from '@/db/schema';
import {
    KEEPA_DAILY_AUTO_BSR_THRESHOLD,
    KEEPA_WEEKLY_AUTO_BSR_THRESHOLD,
} from '@/services/keepa-refresh-policy';

type HistoryAdmissionCapacity = Readonly<{
    refillRate: number;
    productCost: number;
    newAdmissionsPaused: boolean;
}>;

export const getHistoryAdmissionForecast = ({
    daily,
    weekly,
    productCost,
    refillRate,
}: {
    daily: number;
    weekly: number;
    productCost: number;
    refillRate: number;
}) => ({
    projectedDailyTokens: (daily + weekly / 7) * productCost,
    protectedDailyTokens: refillRate * 60 * 24 * 0.5 * 0.9,
});

export const admitProductHistory = async (capacity: HistoryAdmissionCapacity | null) => {
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
        await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended('product-history-admission', 0))`
        );
        const [population] = await tx
            .select({
                daily: sql<number>`count(*) FILTER (WHERE ${products.rootCategoryBsr} < ${KEEPA_DAILY_AUTO_BSR_THRESHOLD})::int`,
                weekly: sql<number>`count(*) FILTER (WHERE ${products.rootCategoryBsr} >= ${KEEPA_DAILY_AUTO_BSR_THRESHOLD})::int`,
            })
            .from(products)
            .where(
                and(
                    eq(products.historyAdmissionState, 'admitted'),
                    eq(products.amazonListingStatus, 'active'),
                    eq(products.isMerchListing, true),
                    lt(products.rootCategoryBsr, KEEPA_WEEKLY_AUTO_BSR_THRESHOLD)
                )
            );
        const forecast = getHistoryAdmissionForecast({ ...population, ...capacity });
        const candidates = await tx
            .select({ id: products.id, bsr: products.rootCategoryBsr })
            .from(products)
            .where(
                and(
                    ne(products.historyAdmissionState, 'admitted'),
                    eq(products.amazonListingStatus, 'active'),
                    eq(products.isMerchListing, true),
                    lt(products.rootCategoryBsr, KEEPA_WEEKLY_AUTO_BSR_THRESHOLD)
                )
            )
            .orderBy(asc(products.rootCategoryBsr), asc(products.createdAt), asc(products.id))
            .limit(100)
            .for('update');
        let projectedDailyTokens = forecast.projectedDailyTokens;
        let admitted = 0;
        let paused = 0;
        for (const candidate of candidates) {
            const cost =
                capacity.productCost /
                ((candidate.bsr ?? Infinity) < KEEPA_DAILY_AUTO_BSR_THRESHOLD ? 1 : 7);
            const canAdmit =
                !capacity.newAdmissionsPaused &&
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
                admitted++;
            } else {
                paused++;
            }
        }
        return {
            admitted,
            paused,
            projectedDailyTokens,
            protectedDailyTokens: forecast.protectedDailyTokens,
            reason: 'evaluated',
        } as const;
    });
};
