import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import type { Job } from 'pg-boss';
import { createContext } from '@/api/context.js';
import { appRouter } from '@/api/router.js';
import { PgBoss } from 'pg-boss';
import { env } from '@/config/env.js';
import { testConnection } from '@/db/index.js';
import { runMigrations } from '@/db/migrate.js';
import { fetchKeepaHistoryForAsin } from '@/jobs/fetch-keepa-history-for-asin.js';
import { processKeepaHistoryRefreshQueue } from '@/jobs/process-keepa-history-refresh-queue.js';
import { processProductIngestQueue } from '@/jobs/process-product-ingest-queue.js';
import { reprocessStaleProducts } from '@/jobs/reprocess-stale-products.js';
import { runTrackedJob } from '@/services/job-executions.js';
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
await boss.createQueue('process-keepa-history-refresh-queue');
await boss.createQueue('fetch-keepa-history-for-asin');

// Register job handlers
boss.work('process-product-ingest-queue', async job => {
    await runTrackedJob({
        jobName: 'process-product-ingest-queue',
        input: job.data,
        shouldPersistSuccess: result => result.didWork,
        run: async logger => {
            const result = await processProductIngestQueue();

            if (result.didWork) {
                logger.info('Processed product ingest queue batch', {
                    marketplaceId: result.marketplaceId,
                    queueCount: result.queueCount,
                    upsertedCount: result.upsertedCount,
                });
            }

            return result;
        },
    });
});
boss.work('reprocess-stale-products', async job => {
    await runTrackedJob({
        jobName: 'reprocess-stale-products',
        input: job.data,
        shouldPersistSuccess: result => result.didWork,
        run: async logger => {
            const result = await reprocessStaleProducts();

            if (result.errorMessage) {
                logger.error('Failed to enqueue stale products', {
                    staleProductCount: result.staleProductCount,
                    error: result.errorMessage,
                });
            } else if (result.didWork) {
                logger.info('Queued stale products for reprocessing', {
                    staleProductCount: result.staleProductCount,
                    enqueuedCount: result.enqueuedCount,
                });
            }

            return result;
        },
    });
});
boss.work('process-keepa-history-refresh-queue', async job => {
    await runTrackedJob({
        jobName: 'process-keepa-history-refresh-queue',
        input: job.data,
        shouldPersistSuccess: result => result.didWork,
        run: async logger => {
            const result = await processKeepaHistoryRefreshQueue(boss);

            if (result.didWork) {
                logger.info('Dispatched Keepa refresh jobs', {
                    batchSize: result.batchSize,
                    dispatchedCount: result.dispatchedCount,
                });
            }

            return result;
        },
    });
});
boss.work('fetch-keepa-history-for-asin', async (jobs: Job<unknown>[]) => {
    for (const queuedJob of jobs) {
        await runTrackedJob({
            jobName: 'fetch-keepa-history-for-asin',
            input: queuedJob.data,
            shouldPersistSuccess: result => result.didWork,
            run: async logger => {
                const payload = getFetchKeepaHistoryJobPayload(queuedJob);
                if (!payload) {
                    logger.warn('Skipping job: missing marketplaceId or asin in job payload', {
                        jobId: queuedJob.id,
                        payload: queuedJob.data,
                    });

                    return {
                        didWork: false,
                        jobId: queuedJob.id,
                        status: 'skipped_invalid_payload',
                    } as const;
                }

                logger.info('Processing Keepa history fetch', payload);

                await fetchKeepaHistoryForAsin(payload);

                logger.info('Completed Keepa history fetch', payload);

                return {
                    didWork: true,
                    ...payload,
                    status: 'completed',
                } as const;
            },
        });
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

// Send Keepa history queue processing job every minute as singleton
setInterval(async () => {
    await boss.send(
        'process-keepa-history-refresh-queue',
        {},
        {
            singletonKey: 'process-keepa-history-refresh-queue',
            retryLimit: 0,
        }
    );
}, 60 * 1000);

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
    // tRPC batches encode procedure names in a single path segment (comma-separated).
    // Fastify defaults maxParamLength to 100, which is too small for multi-query batches.
    maxParamLength: 1000,
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
    console.log(`    - process-keepa-history-refresh-queue (interval: 1m, singleton)`);
    console.log(`    - fetch-keepa-history-for-asin (triggered by queue processor)`);
    const posthogStatus = posthogEnabled
        ? 'Enabled'
        : 'Disabled (POSTHOG_API_KEY not set)';
    console.log(`  • PostHog Analytics: ${posthogStatus}`);
    const keepaStatus = env.KEEPA_API_KEY
        ? 'Configured'
        : 'Disabled (KEEPA_API_KEY not set)';
    console.log(`  • Keepa History Sync: ${keepaStatus}`);
    console.log('  • Job Execution Tracking: Enabled (admin dashboard)');
    console.log('  • API Routes: tRPC (/api)');
    console.log('  • Auth: Clerk (app), License (public)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
} catch (err) {
    console.error('Failed to start server:', err);
    await shutdownPostHog();
    process.exit(1);
}

type FetchKeepaHistoryJobPayload = {
    marketplaceId: string;
    asin: string;
};

const getFetchKeepaHistoryJobPayload = (job: Job<unknown>) => {
    if (!isRecord(job.data)) {
        return null;
    }

    const marketplaceId = job.data.marketplaceId;
    const asin = job.data.asin;

    if (typeof marketplaceId !== 'string' || typeof asin !== 'string') {
        return null;
    }

    if (marketplaceId.length === 0 || asin.length === 0) {
        return null;
    }

    return {
        marketplaceId,
        asin,
    } satisfies FetchKeepaHistoryJobPayload;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};
