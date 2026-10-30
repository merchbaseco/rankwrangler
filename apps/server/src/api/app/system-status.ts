import { adminProcedure } from '@/api/trpc';
import { getSystemStatus } from '@/services/system-status';

/** System health, the Product index, provider usage and rate limits. Admins only. */
export const systemStatus = adminProcedure.query(() => getSystemStatus());
