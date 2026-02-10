import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import { createContext } from '@/api/context.js';
import { appRouter } from '@/api/router.js';
import { PgBoss } from 'pg-boss';
import { env } from '@/config/env.js';
import { testConnection } from '@/db/index.js';
import { runMigrations } from '@/db/migrate.js';
import { processProductIngestQueue } from '@/jobs/process-product-ingest-queue.js';
import { reprocessStaleProducts } from '@/jobs/reprocess-stale-products.js';
import { isPostHogEnabled, shutdownPostHog } from '@/services/posthog.js';

console.log('Starting RankWrangler Server...');

// Run database migrations before starting server
await runMigrations();

// Test database connection
await testConnection();

// Test PostHog initialization
const posthogEnabled = isPostHogEnabled();

// Initialize pg-boss
const databaseUser = env.DATABASE_USER || 'rankwrangler';
const databasePassword = env.DATABASE_PASSWORD || 'SecurePass123';
const databaseHost = env.DATABASE_HOST || 'postgres';
const databasePort = env.DATABASE_PORT || 5432;
const databaseName = env.DATABASE_NAME || 'rankwrangler';
const databaseUrl =
    `postgresql://${databaseUser}:${databasePassword}` +
    `@${databaseHost}:${databasePort}/${databaseName}`;
const boss = new PgBoss({ connectionString: databaseUrl });
await boss.start();
console.log('[Server] pg-boss initialized');

// Create queues if they don't exist
await boss.createQueue('process-product-ingest-queue');
await boss.createQueue('reprocess-stale-products');

// Register job handlers
boss.work('process-product-ingest-queue', processProductIngestQueue);
boss.work('reprocess-stale-products', async () => {
    try {
        await reprocessStaleProducts();
    } catch (error) {
        console.error('[Reprocess Stale Products] Job failed:', error);
        throw error; // Re-throw to mark job as failed
    }
});

// Send job to process queue every second
setInterval(async () => {
    await boss.send(
        'process-product-ingest-queue',
        {},
        {
            singletonKey: 'process-product-ingest-queue',
            retryLimit: 0,
        }
    );
}, 1000);

// Schedule reprocess stale products job to run every 10 minutes using pg-boss cron
await boss.schedule('reprocess-stale-products', '*/10 * * * *', {});
console.log('[Server] Scheduled reprocess-stale-products job to run every 10 minutes');

// Run reprocess stale products job on startup
// try {
//     await reprocessStaleProducts();
//     console.log('[Server] Ran reprocess-stale-products job on startup');
// } catch (error) {
//     console.error('[Server] Failed to run reprocess-stale-products job on startup:', error);
// }

const fastify = Fastify({
    logger: false, // Disable Pino logger to avoid bundling issues
});

// Register Fastify plugins
await fastify.register(helmet);
await fastify.register(cors, {
    origin: (origin, callback) => {
        const allowedOrigins = [
            'https://merchbase.co',
            'https://rankwrangler.merchbase.co',
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

// tRPC API routes
await fastify.register(fastifyTRPCPlugin, {
    prefix: '/api',
    trpcOptions: {
        router: appRouter,
        createContext,
    },
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

// Graceful shutdown handler
const shutdown = async (signal: string) => {
    console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);

    try {
        // Shutdown PostHog to flush any pending events
        await shutdownPostHog();
        console.log('[Server] PostHog shutdown complete');

        // Stop pg-boss
        await boss.stop();
        console.log('[Server] pg-boss stopped');

        // Close Fastify server
        await fastify.close();
        console.log('[Server] Fastify server closed');

        console.log(`[${new Date().toISOString()}] Shutdown complete`);
        process.exit(0);
    } catch (error) {
        console.error('[Server] Error during shutdown:', error);
        process.exit(1);
    }
};

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
    // Start Fastify server
    await fastify.listen({ port, host: '0.0.0.0' });

    // Print startup status summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`[${new Date().toISOString()}] RankWrangler Server Ready`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✓ Server running on port ${port}`);
    console.log(`✓ Health check endpoint: /api/health`);
    console.log('');
    console.log('Status Summary:');
    console.log(`  • Database: Connected`);
    console.log(`  • Migrations: Complete`);
    console.log(`  • Jobs Registered:`);
    console.log(`    - process-product-ingest-queue (interval: 1s)`);
    console.log(`    - reprocess-stale-products (cron: */10 * * * *)`);
    const posthogStatus = posthogEnabled
        ? 'Enabled'
        : 'Disabled (POSTHOG_API_KEY not set)';
    console.log(`  • PostHog Analytics: ${posthogStatus}`);
    console.log('  • API Routes: tRPC (/api)');
    console.log('  • Auth: Clerk (app), License (public)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
} catch (err) {
    console.error('Failed to start server:', err);
    await shutdownPostHog();
    process.exit(1);
}
