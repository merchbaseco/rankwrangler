import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createDatabaseConnectionOptions } from '@/config/database-connection';
import { env } from '@/config/env';
import * as schema from './schema';

// Both pools go through PlanetScale's transaction-mode PgBouncer over a WAN round trip. When every
// connection is busy, postgres.js pipelines a query behind another connection's in-flight work, so
// jobs holding multi-statement transactions delayed dashboard reads. Interactive requests get their
// own pool and only wait for each other.
const connect = (max: number) =>
    drizzle(
        postgres({
            ...createDatabaseConnectionOptions(env, 'application'),
            max,
            idle_timeout: 10000,
            max_lifetime: 30000,
            onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
        }),
        { schema, logger: process.env.NODE_ENV === 'development' }
    );
const background = connect(10);
const interactive = connect(10);
const interactiveScope = new AsyncLocalStorage<true>();

/**
 * Runs `work`, and everything it starts, on the interactive pool. The server wraps API and MCP
 * requests in it; jobs and anything outside a request use the background pool.
 */
export const runInteractive = <T>(work: () => T) => interactiveScope.run(true, work);

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
