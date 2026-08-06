import { router } from '@/api/trpc.js';
import { keywordGet } from './keyword-get';
import { keywordHistory } from './keyword-history';
import { keywordSearch } from './keyword-search';

export const keywordRouter = router({
    get: keywordGet,
    history: keywordHistory,
    search: keywordSearch,
});
