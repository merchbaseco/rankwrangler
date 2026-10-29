import type postgres from 'postgres';
import { z } from 'zod';

export const databaseConfigurationSchema = z.object({
    RANKWRANGLER_DATABASE_HOST: z.string().optional(),
    RANKWRANGLER_DATABASE_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    RANKWRANGLER_DATABASE_DIRECT_PORT: z.preprocess(
        value => (value === '' ? undefined : value),
        z.coerce.number().int().min(1).max(65_535).optional()
    ),
    RANKWRANGLER_DATABASE_NAME: z.string().optional(),
    RANKWRANGLER_DATABASE_USER: z.string().optional(),
    RANKWRANGLER_DATABASE_PASSWORD: z.string().optional(),
    RANKWRANGLER_DATABASE_SSL_MODE: z.enum(['disable', 'verify-full']).default('disable'),
});

type DatabaseConfiguration = z.infer<typeof databaseConfigurationSchema>;

export const createDatabaseConnectionOptions = (
    configuration: DatabaseConfiguration,
    connection: 'application' | 'direct'
) =>
    ({
        host: configuration.RANKWRANGLER_DATABASE_HOST || 'postgres',
        port:
            (connection === 'direct' && configuration.RANKWRANGLER_DATABASE_DIRECT_PORT) ||
            configuration.RANKWRANGLER_DATABASE_PORT ||
            5432,
        database: configuration.RANKWRANGLER_DATABASE_NAME || 'rankwrangler',
        username: configuration.RANKWRANGLER_DATABASE_USER || 'rankwrangler',
        password: configuration.RANKWRANGLER_DATABASE_PASSWORD || 'SecurePass123',
        ssl: configuration.RANKWRANGLER_DATABASE_SSL_MODE === 'verify-full' ? 'verify-full' : false,
        prepare: connection === 'direct',
        connection: { TimeZone: 'UTC' },
    }) satisfies postgres.Options<Record<string, never>>;

export const createDatabaseUrl = (configuration: DatabaseConfiguration) => {
    const options = createDatabaseConnectionOptions(configuration, 'direct');
    const url = new URL('postgresql://localhost');
    url.hostname = options.host;
    url.port = String(options.port);
    url.username = encodeURIComponent(String(options.username));
    url.password = encodeURIComponent(String(options.password));
    url.pathname = `/${encodeURIComponent(options.database)}`;
    url.searchParams.set('sslmode', options.ssl === false ? 'disable' : options.ssl);
    return url.toString();
};
