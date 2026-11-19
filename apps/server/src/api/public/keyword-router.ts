import { router } from '@/api/trpc.js';
import { keywordGet } from './keyword-get';
import { keywordList } from './keyword-list';

export const keywordRouter = router({
    get: keywordGet,
    list: keywordList,
});
