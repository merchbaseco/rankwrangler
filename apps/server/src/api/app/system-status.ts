import { adminProcedure } from '@/api/trpc';
import { getSystemStatus } from '@/services/system-status';

/** System health, pipeline schedules, the Product index and provider allowance. Admins only. */
export const systemStatus = adminProcedure.query(() => getSystemStatus());
