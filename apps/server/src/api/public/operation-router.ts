import { router } from '@/api/trpc.js';
import { operationGet } from './operation-get.js';

export const operationRouter = router({
    get: operationGet,
});
