import { describe, expect, test } from 'bun:test';
import { Client } from 'pg';
import { createDatabaseConnectionOptions, createDatabaseUrl } from './database-connection';

const configuration = {
    RANKWRANGLER_DATABASE_HOST: 'example.pg.psdb.cloud',
    RANKWRANGLER_DATABASE_PORT: 6432,
    RANKWRANGLER_DATABASE_DIRECT_PORT: 5432,
    RANKWRANGLER_DATABASE_NAME: 'postgres',
    RANKWRANGLER_DATABASE_USER: 'user@branch',
    RANKWRANGLER_DATABASE_PASSWORD: 'p@ss:/?#%word',
    RANKWRANGLER_DATABASE_SSL_MODE: 'verify-full',
} satisfies Parameters<typeof createDatabaseConnectionOptions>[0];

describe('database connections', () => {
    test('uses the pooler without prepared statements for app queries', () => {
        expect(createDatabaseConnectionOptions(configuration, 'application')).toMatchObject({
            port: 6432,
            ssl: 'verify-full',
            prepare: false,
        });
    });

    test('uses the direct endpoint for migrations and background jobs', () => {
        expect(createDatabaseConnectionOptions(configuration, 'direct')).toMatchObject({
            port: 5432,
            ssl: 'verify-full',
            prepare: true,
        });
    });

    test('pg-boss node-postgres connection preserves credentials and verifies TLS', () => {
        const client = new Client({ connectionString: createDatabaseUrl(configuration) });
        expect(client.user).toBe(configuration.RANKWRANGLER_DATABASE_USER);
        expect(client.password).toBe(configuration.RANKWRANGLER_DATABASE_PASSWORD);
        expect(client.port).toBe(5432);
        expect(client.ssl).toBeTruthy();
        expect(client.ssl).not.toMatchObject({ rejectUnauthorized: false });
    });

    test('local connections keep the existing port and disable TLS', () => {
        const local = {
            ...configuration,
            RANKWRANGLER_DATABASE_PORT: 5433,
            RANKWRANGLER_DATABASE_DIRECT_PORT: undefined,
            RANKWRANGLER_DATABASE_SSL_MODE: 'disable',
        } satisfies Parameters<typeof createDatabaseConnectionOptions>[0];
        expect(createDatabaseConnectionOptions(local, 'direct')).toMatchObject({
            port: 5433,
            ssl: false,
        });
        expect(new Client({ connectionString: createDatabaseUrl(local) }).ssl).toBe(false);
    });
});
