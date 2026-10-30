import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createDatabaseConnectionOptions } from '@/config/database-connection';
import { env } from '@/config/env';
import * as schema from './schema';

// Both pools go through PlanetScale's transaction-mode PgBouncer over a WAN round trip. When every
// connection is busy, postgres.js pipelines a query behind another connection's in-flight work, so
// jobs holding multi-statement transactions delayed dashboard reads. Interactive requests get their
// own pool and only wait for each other. Unprepared, postgres.js describes every parameterized
// query before running it, a second round trip; the interactive pool prepares statements instead
// (the pooler supports protocol-level prepared statements), so a repeated read costs one. Both stay
// small: postgres.js rotates through every idle connection and prepares per connection, and the
// pooler's server connections share the database's 25 with pg-boss, which a deploy briefly runs
// twice.
const connect = (max: number, prepare: boolean) =>
    drizzle(
        postgres({
            ...createDatabaseConnectionOptions(env, 'application'),
            prepare,
            max,
            idle_timeout: 10000,
            max_lifetime: 30000,
            onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
        }),
        { schema, logger: process.env.NODE_ENV === 'development' }
    );
const background = connect(5, false);
const interactive = connect(3, true);
const interactiveScope = new AsyncLocalStorage<true>();

/**
 * Runs `work`, and everything it starts, on the interactive pool. The server wraps API and MCP
 * requests in it; jobs and anything outside a request use the background pool.
 */
export const runInteractive = <T>(work: () => T) => interactiveScope.run(true, work);

/** Runs `work` on the background pool even inside a request, for work nobody is waiting on. */
export const runBackground = <T>(work: () => T) => interactiveScope.exit(work);

/** The database for the current context: the interactive pool inside a request, else background. */
export const db: typeof background = new Proxy(background, {
    get: (_target, property) => {
        const current = interactiveScope.getStore() ? interactive : background;
        const value = Reflect.get(current, property, current);
        return typeof value === 'function' ? value.bind(current) : value;
    },
});

export type Database = typeof db;

// Test database connection
export const testConnection = async () => {
    try {
        // Simple query to test connection
        await db.execute('SELECT 1');
        console.log('[Database] Connection established successfully.');
        return true;
    } catch (error) {
        console.error('[Database] Unable to connect:', error);
        throw error;
    }
};
