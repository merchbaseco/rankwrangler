import { appApiRouter } from './app/router.js';
import { devRouter } from './dev/router.js';
import { publicApiRouter } from './public/router.js';
import { router } from './trpc.js';

export const appRouter = router({
    api: router({
        app: appApiRouter,
        dev: devRouter,
        public: publicApiRouter,
    }),
});

export type AppRouter = typeof appRouter;
