import { adminProcedure } from '@/api/trpc.js';

export const adminStatus = adminProcedure.query(async () => {
    return {
        isAdmin: true,
    } as const;
});
