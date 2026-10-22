import { defineConfig } from 'drizzle-kit';
import {
    createDatabaseConnectionOptions,
    databaseConfigurationSchema,
} from './src/config/database-connection';

const connection = createDatabaseConnectionOptions(
    databaseConfigurationSchema.parse(process.env),
    'direct'
);

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema.ts',
    out: './drizzle',
    dbCredentials: {
        host: connection.host,
        port: connection.port,
        database: connection.database,
        user: connection.username,
        password: connection.password,
        ssl: connection.ssl,
    },
});
