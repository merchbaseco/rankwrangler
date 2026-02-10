import { appApiRouter } from './app/router.js';
import { publicApiRouter } from './public/router.js';
import { router } from './trpc.js';

export const appRouter = router({
    api: router({
        public: publicApiRouter,
        app: appApiRouter,
    }),
});

export type AppRouter = typeof appRouter;
