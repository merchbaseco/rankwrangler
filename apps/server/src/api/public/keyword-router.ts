import { router } from '@/api/trpc.js';
import { keywordGet } from './keyword-get';
import { keywordHistory } from './keyword-history';
import { keywordResults } from './keyword-results';
import { keywordSearch } from './keyword-search';

export const keywordRouter = router({
    get: keywordGet,
    results: keywordResults,
    history: keywordHistory,
    search: keywordSearch,
});
