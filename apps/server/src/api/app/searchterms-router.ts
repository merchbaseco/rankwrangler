import { router } from '@/api/trpc.js';
import { searchTermsList } from './search-terms-list.js';
import { searchTermsRefresh } from './search-terms-refresh.js';
import { searchTermsStatus } from './search-terms-status.js';
import { searchtermsTrend } from './searchterms-trend.js';

export const searchtermsRouter = router({
    list: searchTermsList,
    refresh: searchTermsRefresh,
    status: searchTermsStatus,
    trend: searchtermsTrend,
});
