import { router } from '@/api/trpc.js';
import { devCreateClerkSignInToken } from './dev-create-clerk-sign-in-token.js';

export const devRouter = router({
    createClerkSignInToken: devCreateClerkSignInToken,
});
