import { adminRouter } from './routers/admin.js';
import { publicRouter } from './routers/public.js';
import { router } from './trpc.js';

export const appRouter = router({
    admin: adminRouter,
    public: publicRouter,
});

export type AppRouter = typeof appRouter;
