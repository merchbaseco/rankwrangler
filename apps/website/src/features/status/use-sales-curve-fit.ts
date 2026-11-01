import { api, type RouterOutputs } from '@/lib/trpc';

export type SalesCurveFit = RouterOutputs['api']['app']['system']['salesCurve'];
export type SalesCurveReport = NonNullable<SalesCurveFit['report']>;

/**
 * The sales curve with the evidence and accuracy check its last fit built
 * (`system.salesCurve`, admins only). The server refits every six hours and
 * serves the stored result, so the page never waits on analysis.
 */
export const useSalesCurveFit = () =>
    api.api.app.system.salesCurve.useQuery(undefined, {
        refetchOnWindowFocus: false,
        staleTime: 10 * 60_000,
    });
