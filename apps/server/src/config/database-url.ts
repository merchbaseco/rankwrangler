import { env } from '@/config/env';
import { createDatabaseUrl } from './database-connection';

// pg-boss and operator work need a direct session rather than transaction pooling.
export const buildDatabaseUrl = () => createDatabaseUrl(env);
