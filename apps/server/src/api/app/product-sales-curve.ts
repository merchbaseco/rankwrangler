import { appProcedure } from '@/api/trpc';
import { readSalesCurve } from '@/services/sales-curve';

export const productSalesCurve = appProcedure.query(() => readSalesCurve());
