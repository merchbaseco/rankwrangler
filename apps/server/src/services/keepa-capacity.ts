import type { Database } from '@/db/index';

/** The observed refill rate and measured costs admission plans with; null until all are known. */
export const getKeepaAdmissionCapacity = async (
    database?: Pick<Database, 'select'>
): Promise<{
    refillRate: number;
    productCost: number;
    headCost: number;
} | null> => {
    const [{ keepaCapacityState }, { measuredKeepaCost }] = await Promise.all([
        import('@/db/keepa-capacity-schema'),
        import('@/db/keepa-measured-costs'),
    ]);
    const reader = database ?? (await import('@/db/index')).db;
    const [state] = await reader
        .select({
            refillRate: keepaCapacityState.refillRate,
            observedAt: keepaCapacityState.observedAt,
            productCost: measuredKeepaCost('product').mapWith(nullableNumber),
            headCost: measuredKeepaCost('search').mapWith(nullableNumber),
        })
        .from(keepaCapacityState);
    if (!state || Date.now() - state.observedAt.getTime() > 120_000) {
        return null;
    }
    if (state.headCost === null || state.productCost === null) {
        return null;
    }
    return {
        refillRate: state.refillRate,
        productCost: state.productCost,
        headCost: state.headCost,
    };
};

const nullableNumber = (value: unknown) => (value === null ? null : Number(value));
