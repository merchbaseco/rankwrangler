import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/config/env.js';
import * as schema from './schema.js';

// Create postgres connection
const queryClient = postgres({
  host: env.DATABASE_HOST || 'postgres',
  port: env.DATABASE_PORT || 5432,
  database: env.DATABASE_NAME || 'licenses',
  username: env.DATABASE_USER || 'rankwrangler',
  password: env.DATABASE_PASSWORD || 'SecurePass123',
  max: 5,
  idle_timeout: 10000,
  max_lifetime: 30000,
  onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// Create Drizzle database instance
export const db = drizzle(queryClient, { 
  schema,
  logger: process.env.NODE_ENV === 'development'
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