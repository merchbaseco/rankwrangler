import { env } from '@/config/env';

/**
 * The PostgreSQL connection string for this process, built from the same
 * environment items `@/db/index` opens its pool with.
 *
 * Two callers need the URL rather than the pool: pg-boss, which takes a
 * connection string, and the development Access Projection bootstrap, which
 * reads it only to prove the target is loopback. Building it in one place keeps
 * those two from drifting away from the pool the rest of the server uses.
 */
export const buildDatabaseUrl = () => {
    const user = env.RANKWRANGLER_DATABASE_USER || 'rankwrangler';
    const password = env.RANKWRANGLER_DATABASE_PASSWORD || 'SecurePass123';
    const host = env.RANKWRANGLER_DATABASE_HOST || 'postgres';
    const port = env.RANKWRANGLER_DATABASE_PORT || 5432;
    const name = env.RANKWRANGLER_DATABASE_NAME || 'rankwrangler';

    return `postgresql://${user}:${password}@${host}:${port}/${name}`;
};
