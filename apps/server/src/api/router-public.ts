import { publicApiRouter } from './public/router.js';
import { router } from './trpc.js';

export const publicAppRouter = router({
    api: router({
        public: publicApiRouter,
    }),
});

export type PublicAppRouter = typeof publicAppRouter;
