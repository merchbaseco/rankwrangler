import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createDatabaseConnectionOptions } from '@/config/database-connection';
import { env } from '@/config/env';
import * as schema from './schema';

// Create postgres connection
const queryClient = postgres({
    ...createDatabaseConnectionOptions(env, 'application'),
    max: 5,
    idle_timeout: 10000,
    max_lifetime: 30000,
    onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// Create Drizzle database instance
export const db = drizzle(queryClient, {
    schema,
    logger: process.env.NODE_ENV === 'development',
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
