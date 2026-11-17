import { adminProcedure } from '@/api/trpc';
import { readProductStats } from '@/db/product-stats';
import {
    getKeepaRefreshPolicyBuckets,
    getSpApiRefreshPolicyBuckets,
} from '@/services/admin-refresh-policy-buckets';

/**
 * How many Products sit in each Keepa and SP-API refresh tier, and each tier's cadence, from the
 * stored Product counts (`countedAt`). Both lists are empty until the first count.
 */
export const systemRefreshTiers = adminProcedure.query(async () => {
    const stats = await readProductStats();
    return {
        countedAt: stats?.observedAt.toISOString() ?? null,
        keepa: stats ? getKeepaRefreshPolicyBuckets(stats) : [],
        spApi: stats ? getSpApiRefreshPolicyBuckets(stats) : [],
    };
});
