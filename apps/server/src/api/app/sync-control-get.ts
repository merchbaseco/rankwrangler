import { appProcedure } from '@/api/trpc';
import { readAutomaticSync } from '@/db/automatic-sync';

export const syncControlGet = appProcedure.query(async ({ ctx }) => ({
    ...(await readAutomaticSync()),
    canManage: ctx.isAdmin,
}));
