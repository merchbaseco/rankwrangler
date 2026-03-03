import { adminProcedure } from '@/api/trpc.js';
import { getTopSearchTermsStatus } from '@/services/top-search-terms-status.js';

export const topSearchTermsStatus = adminProcedure.query(async () => {
    return getTopSearchTermsStatus();
});
