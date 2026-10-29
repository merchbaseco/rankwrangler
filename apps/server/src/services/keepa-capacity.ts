import type { Database } from '@/db/index';

export const getKeepaAdmissionCapacity = async (
    database?: Pick<Database, 'select' | 'execute'>
): Promise<{
    refillRate: number;
    productCost: number;
    headCost: number;
} | null> => {
    const [{ keepaCapacityState }, { readKeepaMeasuredCosts }] = await Promise.all([
        import('@/db/keepa-capacity-schema'),
        import('@/db/keepa-capacity'),
    ]);
    const reader = database ?? (await import('@/db/index')).db;
    const [state] = await reader.select().from(keepaCapacityState);
    if (!state || Date.now() - state.observedAt.getTime() > 120_000) {
        return null;
    }
    const costs = await readKeepaMeasuredCosts(reader);
    if (costs.headCost === null || costs.productCost === null) {
        return null;
    }
    return {
        refillRate: state.refillRate,
        productCost: costs.productCost,
        headCost: costs.headCost,
    };
};

export const getKeepaCapacitySnapshot = async () =>
    (await import('@/db/keepa-capacity-snapshot')).readKeepaCapacitySnapshot();
