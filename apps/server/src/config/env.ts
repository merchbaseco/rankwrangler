import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

// Production must not boot without a webhook signing secret, but development
// has no Clerk webhook endpoint and therefore no secret to resolve — the
// schema leaves it undefined there. NODE_ENV is set by the runtime image, so
// it is the lifecycle signal available inside the container.
const isProduction = process.env.NODE_ENV === 'production';

export const env = createEnv({
    server: {
        RANKWRANGLER_PORT: z.coerce.number().default(8080),
        RANKWRANGLER_SPAPI_REFRESH_TOKEN: z.string(),
        RANKWRANGLER_SPAPI_CLIENT_ID: z.string(),
        RANKWRANGLER_SPAPI_APP_CLIENT_SECRET: z.string(),
        MERCHBASE_CLERK_SECRET_KEY: z.string().min(1, 'MERCHBASE_CLERK_SECRET_KEY is required'),
        MERCHBASE_CLERK_PUBLISHABLE_KEY: z.string().min(1, 'MERCHBASE_CLERK_PUBLISHABLE_KEY is required'),
        MERCHBASE_CLERK_JWT_KEY: z.string().min(1, 'MERCHBASE_CLERK_JWT_KEY is required'),
        MERCHBASE_CLERK_ISSUER: z.string().url('MERCHBASE_CLERK_ISSUER must be a URL'),
        RANKWRANGLER_CLERK_AUTHORIZED_PARTIES: z.string().min(1, 'RANKWRANGLER_CLERK_AUTHORIZED_PARTIES is required'),
        RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET: isProduction
            ? z.string().min(1, 'RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET is required in production')
            : z.string().min(1).optional(),
        RANKWRANGLER_ADMIN_MERCHBASE_USER_ID: z.string().startsWith('mbu_').optional(),
        RANKWRANGLER_KEEPA_API_KEY: z.string().optional(),
        RANKWRANGLER_GEMINI_API_KEY: z.string().optional(),
        RANKWRANGLER_DEV_CLERK_SIGN_IN_USER_ID: z.string().optional(),
        RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER: z.stringbool().default(false),
        RANKWRANGLER_DATABASE_MIGRATION_TARGET: z.enum(['pre-cutover', 'latest']).default('pre-cutover'),
        RANKWRANGLER_DATABASE_HOST: z.string().optional(),
        RANKWRANGLER_DATABASE_PORT: z.coerce.number().optional(),
        RANKWRANGLER_DATABASE_NAME: z.string().optional(),
        RANKWRANGLER_DATABASE_USER: z.string().optional(),
        RANKWRANGLER_DATABASE_PASSWORD: z.string().optional(),
    },
    runtimeEnv: {
        RANKWRANGLER_PORT: process.env.RANKWRANGLER_PORT,
        RANKWRANGLER_SPAPI_REFRESH_TOKEN: process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN,
        RANKWRANGLER_SPAPI_CLIENT_ID: process.env.RANKWRANGLER_SPAPI_CLIENT_ID,
        RANKWRANGLER_SPAPI_APP_CLIENT_SECRET: process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET,
        MERCHBASE_CLERK_SECRET_KEY: process.env.MERCHBASE_CLERK_SECRET_KEY,
        MERCHBASE_CLERK_PUBLISHABLE_KEY: process.env.MERCHBASE_CLERK_PUBLISHABLE_KEY,
        MERCHBASE_CLERK_JWT_KEY: process.env.MERCHBASE_CLERK_JWT_KEY,
        MERCHBASE_CLERK_ISSUER: process.env.MERCHBASE_CLERK_ISSUER,
        RANKWRANGLER_CLERK_AUTHORIZED_PARTIES: process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES,
        RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET: process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET,
        RANKWRANGLER_ADMIN_MERCHBASE_USER_ID: process.env.RANKWRANGLER_ADMIN_MERCHBASE_USER_ID,
        RANKWRANGLER_KEEPA_API_KEY: process.env.RANKWRANGLER_KEEPA_API_KEY,
        RANKWRANGLER_GEMINI_API_KEY: process.env.RANKWRANGLER_GEMINI_API_KEY,
        RANKWRANGLER_DEV_CLERK_SIGN_IN_USER_ID: process.env.RANKWRANGLER_DEV_CLERK_SIGN_IN_USER_ID,
        RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER: process.env.RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER,
        RANKWRANGLER_DATABASE_MIGRATION_TARGET: process.env.RANKWRANGLER_DATABASE_MIGRATION_TARGET,
        RANKWRANGLER_DATABASE_HOST: process.env.RANKWRANGLER_DATABASE_HOST,
        RANKWRANGLER_DATABASE_PORT: process.env.RANKWRANGLER_DATABASE_PORT,
        RANKWRANGLER_DATABASE_NAME: process.env.RANKWRANGLER_DATABASE_NAME,
        RANKWRANGLER_DATABASE_USER: process.env.RANKWRANGLER_DATABASE_USER,
        RANKWRANGLER_DATABASE_PASSWORD: process.env.RANKWRANGLER_DATABASE_PASSWORD,
    },
});
