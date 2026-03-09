import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(8080),
    SPAPI_REFRESH_TOKEN: z.string(),
    SPAPI_CLIENT_ID: z.string(),
    SPAPI_APP_CLIENT_SECRET: z.string(),
    LICENSE_SECRET: z.string().min(32, 'LICENSE_SECRET must be at least 32 characters'),
    CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD_HASH: z.string().optional(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),
    KEEPA_API_KEY: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    DEV_CLERK_SIGN_IN_USER_ID: z.string().optional(),
    // Database configuration
    DATABASE_HOST: z.string().optional(),
    DATABASE_PORT: z.coerce.number().optional(),
    DATABASE_NAME: z.string().optional(),
    DATABASE_USER: z.string().optional(),
    DATABASE_PASSWORD: z.string().optional(),
  },
  runtimeEnv: {
    PORT: process.env.PORT,
    SPAPI_REFRESH_TOKEN: process.env.SPAPI_REFRESH_TOKEN,
    SPAPI_CLIENT_ID: process.env.SPAPI_CLIENT_ID,
    SPAPI_APP_CLIENT_SECRET: process.env.SPAPI_APP_CLIENT_SECRET,
    LICENSE_SECRET: process.env.LICENSE_SECRET,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    SESSION_SECRET: process.env.SESSION_SECRET,
    KEEPA_API_KEY: process.env.KEEPA_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    DEV_CLERK_SIGN_IN_USER_ID: process.env.DEV_CLERK_SIGN_IN_USER_ID,
    // Database configuration
    DATABASE_HOST: process.env.DATABASE_HOST,
    DATABASE_PORT: process.env.DATABASE_PORT,
    DATABASE_NAME: process.env.DATABASE_NAME,
    DATABASE_USER: process.env.DATABASE_USER,
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
  },
});
