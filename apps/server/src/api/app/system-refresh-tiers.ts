import { adminProcedure } from '@/api/trpc';
import {
    getKeepaRefreshPolicyBuckets,
    getSpApiRefreshPolicyBuckets,
} from '@/services/admin-refresh-policy-buckets';

/** How many Products sit in each Keepa and SP-API refresh tier, and each tier's cadence. */
export const systemRefreshTiers = adminProcedure.query(async () => {
    const [keepa, spApi] = await Promise.all([
        getKeepaRefreshPolicyBuckets(),
        getSpApiRefreshPolicyBuckets(),
    ]);
    return { keepa, spApi };
});
