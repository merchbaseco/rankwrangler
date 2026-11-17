import { asc, inArray, lte } from 'drizzle-orm';
import { db } from './index';
import { keepaCapacityAttempts } from './keepa-capacity-schema';

/**
 * Deletes up to `batchSize` Keepa capacity attempts created at or before `before`, oldest first by
 * the `created_at` index. Reservations read at most a day back and measured costs live in
 * `keepa_measured_costs`, so old attempts carry nothing a decision needs.
 */
export const deleteExpiredKeepaCapacityAttempts = async ({
    before,
    batchSize,
}: {
    before: Date;
    batchSize: number;
}) => {
    const rows = await db
        .select({ id: keepaCapacityAttempts.id })
        .from(keepaCapacityAttempts)
        .where(lte(keepaCapacityAttempts.createdAt, before))
        .orderBy(asc(keepaCapacityAttempts.createdAt))
        .limit(batchSize);
    if (rows.length === 0) {
        return 0;
    }
    await db.delete(keepaCapacityAttempts).where(
        inArray(
            keepaCapacityAttempts.id,
            rows.map(row => row.id)
        )
    );
    return rows.length;
};
