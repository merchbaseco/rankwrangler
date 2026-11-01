import { adminProcedure } from '@/api/trpc';
import { readSalesCurveFit } from '@/services/sales-curve';

/** The sales curve with the evidence and accuracy check its last fit built. Admins only. */
export const systemSalesCurve = adminProcedure.query(() => readSalesCurveFit());
