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
import { validateLicense } from '@/services/license.js';
import { db } from '@/db/index.js';
import { productIngestQueue } from '@/db/schema.js';
import { getProductInfoFromStore } from '@/db/product/get-product.js';

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

// -----------------------------------------------------------------------------
// Legacy Extension API (v1)
// These endpoints are used by the browser extension and must remain stable.
// The newer API is tRPC under /api/*.
// -----------------------------------------------------------------------------
const extractBearerToken = (authorization?: string): string | null => {
    if (!authorization) return null;
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return (match ? match[1] : authorization).trim() || null;
};

fastify.get('/api/license/status', async (request, reply) => {
    const key = extractBearerToken(request.headers.authorization);
    if (!key) {
        reply.status(401);
        return { error: 'Invalid or missing license key' };
    }

    const validation = await validateLicense(key, { consume: false });
    if (!validation.valid) {
        reply.status(401);
        return { error: validation.error ?? 'Invalid license key' };
    }

    return { data: validation.data };
});

fastify.post('/api/license/validate', async (request, reply) => {
    const body = (request.body ?? {}) as { licenseKey?: unknown };
    const key = typeof body.licenseKey === 'string' ? body.licenseKey.trim() : '';

    if (!key) {
        reply.status(400);
        return { error: 'License key is required' };
    }

    const validation = await validateLicense(key, { consume: false });
    if (!validation.valid) {
        reply.status(401);
        return { error: validation.error ?? 'Invalid license key' };
    }

    return { data: validation.data };
});

fastify.post('/api/getProductInfo', async (request, reply) => {
    const licenseKey = extractBearerToken(request.headers.authorization);
    if (!licenseKey) {
        reply.status(401);
        return { error: 'Invalid or missing license key' };
    }

    // Validate + consume usage for this request
    const validation = await validateLicense(licenseKey, { consume: true });
    if (!validation.valid) {
        const message = validation.error ?? 'Invalid license key';
        // Rate limit errors should surface as 429 for the extension UX.
        if (message.toLowerCase().includes('daily limit')) {
            reply.status(429);
            return { error: message };
        }
        reply.status(401);
        return { error: message };
    }

    const body = (request.body ?? {}) as { marketplaceId?: unknown; asin?: unknown };
    const marketplaceId = typeof body.marketplaceId === 'string' ? body.marketplaceId.trim() : '';
    const asinRaw = typeof body.asin === 'string' ? body.asin.trim().toUpperCase() : '';

    if (!marketplaceId || !asinRaw) {
        reply.status(400);
        return { error: 'marketplaceId and asin are required' };
    }

    if (!/^[A-Z0-9]{10}$/.test(asinRaw)) {
        reply.status(400);
        return { error: 'Invalid ASIN format' };
    }

    // 1) Return cached product if present
    const cachedProduct = await getProductInfoFromStore(marketplaceId, asinRaw);
    if (cachedProduct) {
        return { data: cachedProduct };
    }

    // 2) Enqueue and poll
    await db.insert(productIngestQueue).values({ marketplaceId, asin: asinRaw }).onConflictDoNothing();

    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const polled = await getProductInfoFromStore(marketplaceId, asinRaw);
        if (polled) {
            return { data: polled };
        }
    }

    reply.status(504);
    return { error: 'Request timeout: product info not available after 10 seconds' };
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
