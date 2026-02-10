import { listLicenses } from '@/services/license.js';
import { adminProcedure } from '@/api/trpc.js';

export const licenseList = adminProcedure.query(async () => {
    return listLicenses();
});
