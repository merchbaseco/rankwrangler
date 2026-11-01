import { api } from '@/lib/trpc';
import type { SalesCurve } from './sales-estimate';

/**
 * The server's current rank-to-sales curve (`product.salesCurve`). It refits
 * every few hours, so one read per hour is plenty; null until it loads or
 * while too few badges exist to fit one.
 */
export const useSalesCurve = (): SalesCurve | null => {
    const query = api.api.app.product.salesCurve.useQuery(undefined, {
        refetchOnWindowFocus: false,
        staleTime: 3_600_000,
    });
    return query.data?.curve ?? null;
};
