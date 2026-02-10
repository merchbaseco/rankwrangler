import { publicApiRouter } from './public/router.js';
import { router } from './trpc.js';

export const publicAppRouter = router({
    api: router({
        public: publicApiRouter,
        cli: publicApiRouter,
    }),
});

export const cliAppRouter = publicAppRouter;

export type PublicAppRouter = typeof publicAppRouter;
export type CliAppRouter = PublicAppRouter;
