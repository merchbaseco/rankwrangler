import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema.ts',
    out: './drizzle',
    dbCredentials: {
        host: process.env.RANKWRANGLER_DATABASE_HOST || 'localhost',
        port: Number(process.env.RANKWRANGLER_DATABASE_PORT) || 5432,
        database: process.env.RANKWRANGLER_DATABASE_NAME || 'rankwrangler',
        user: process.env.RANKWRANGLER_DATABASE_USER || 'rankwrangler',
        password: process.env.RANKWRANGLER_DATABASE_PASSWORD || 'SecurePass123',
    },
});
