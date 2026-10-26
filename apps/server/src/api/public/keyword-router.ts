import { router } from '@/api/trpc.js';
import { keywordGet } from './keyword-get';
import { keywordResults } from './keyword-results';
import { keywordSearch } from './keyword-search';

export const keywordRouter = router({
    get: keywordGet,
    results: keywordResults,
    search: keywordSearch,
});
