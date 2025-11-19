import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import { PgBoss } from 'pg-boss';
import { env } from '@/config/env.js';
import { testConnection } from '@/db/index.js';
import { runMigrations } from '@/db/migrate.js';

console.log('Starting RankWrangler Server...');

// Run database migrations before starting server
await runMigrations();

// Test database connection
await testConnection();

// Initialize pg-boss
const databaseUrl = `postgresql://${env.DATABASE_USER || 'rankwrangler'}:${env.DATABASE_PASSWORD || 'SecurePass123'}@${env.DATABASE_HOST || 'postgres'}:${env.DATABASE_PORT || 5432}/${env.DATABASE_NAME || 'rankwrangler'}`;
const boss = new PgBoss({ connectionString: databaseUrl });
await boss.start();
console.log('[Server] pg-boss initialized');

// Create queue if it doesn't exist
await boss.createQueue('product-ingest-queue');

// Register job handlers
const { processProductIngestQueue } = await import('@/jobs/process-product-ingest-queue.js');
boss.work('product-ingest-queue', processProductIngestQueue);

// Send job to process queue every second
setInterval(async () => {
    await boss.send(
        'product-ingest-queue',
        {},
        {
            singletonKey: 'process-product-ingest-queue',
            retryLimit: 1,
        }
    );
}, 1000);

const fastify = Fastify({
    logger: false, // Disable Pino logger to avoid bundling issues
});

// Register Fastify plugins
await fastify.register(helmet);
await fastify.register(cors, {
    origin: (origin, callback) => {
        const allowedOrigins = [
            'https://merchbase.co',
            'http://localhost:3000',
            'http://localhost:5173',
        ];

        // Allow Safari extension origins
        if (origin?.startsWith('safari-web-extension://')) {
            return callback(null, true);
        }

        // Allow Chrome extension origins
        if (origin?.startsWith('chrome-extension://')) {
            return callback(null, true);
        }

        // Allow requests with no origin (e.g., mobile apps, server-to-server)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
});

// Health check endpoint
fastify.get('/api/health', async () => {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'rankwrangler-server',
    };
});

// API routes
fastify.register(async fastify => {
    // Register API routes
    const { registerGetProductInfoRoute } = await import('@/api/getProductInfo.js');
    await registerGetProductInfoRoute(fastify);

    const { registerAmazonGetProductInfoRoute } = await import('@/api/amazon/getProductInfo.js');
    await registerAmazonGetProductInfoRoute(fastify);

    // Register license routes
    const { registerLicenseValidateRoute } = await import('@/api/license/validate.js');
    await registerLicenseValidateRoute(fastify);

    const { registerLicenseStatusRoute } = await import('@/api/license/status.js');
    await registerLicenseStatusRoute(fastify);

    // Register admin license routes
    const { registerAdminLicenseGenerateRoute } = await import('@/api/admin/license/generate.js');
    await registerAdminLicenseGenerateRoute(fastify);

    const { registerAdminLicenseListRoute } = await import('@/api/admin/license/list.js');
    await registerAdminLicenseListRoute(fastify);

    const { registerAdminLicenseDetailsRoute } = await import('@/api/admin/license/details.js');
    await registerAdminLicenseDetailsRoute(fastify);

    const { registerAdminLicenseDeleteRoute } = await import('@/api/admin/license/delete.js');
    await registerAdminLicenseDeleteRoute(fastify);

    const { registerAdminLicenseResetRoute } = await import('@/api/admin/license/reset.js');
    await registerAdminLicenseResetRoute(fastify);

    // Register admin cache routes
    const { registerAdminCacheClearRoute } = await import('@/api/admin/cache/clear.js');
    await registerAdminCacheClearRoute(fastify);
});

// 404 handler
fastify.setNotFoundHandler(async (_request, reply) => {
    reply.status(404);
    return {
        success: false,
        error: 'Route not found',
    };
});

// Error handler
fastify.setErrorHandler(async (error, _request, reply) => {
    console.error(`[${new Date().toISOString()}] Unhandled error:`, error);
    reply.status(500);
    return {
        success: false,
        error: 'Internal server error',
    };
});

const port = env.PORT;

console.log(`Attempting to start server on port ${port}...`);

try {
    // Start Fastify server
    await fastify.listen({ port, host: '0.0.0.0' });

    console.log(`[${new Date().toISOString()}] RankWrangler Server running on port ${port}`);
    console.log(`[${new Date().toISOString()}] Health check: http://localhost:${port}/api/health`);
    console.log(
        `[${new Date().toISOString()}] API endpoints: http://localhost:${port}/api/getProductInfo, http://localhost:${port}/api/amazon/getProductInfo`
    );
} catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
}
