import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { assertDevCloudflareAccessTarget } from '@merchbaseco/access/dev';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import { PgBoss } from 'pg-boss';
import { createContext } from '@/api/context.js';
import { registerHealthRoutes } from '@/api/health-routes.js';
import { registerInteractiveRequests } from '@/api/interactive-requests';
import { registerServerTiming, timeAuthorization } from '@/api/server-timing';
import { appRouter } from '@/api/router.js';
import { registerTrpcWebsocketServer, TRPC_WEBSOCKET_PATH } from '@/api/trpc-websocket-server';
import { createCorsOriginHandler } from '@/config/cors-origin';
import { buildDatabaseUrl } from '@/config/database-url';
import { env } from '@/config/env.js';
import {
    getProductHistoryOperationsStatus,
    getServerRuntimeFlags,
} from '@/config/server-runtime.js';
import { readAutomaticSync } from '@/db/automatic-sync';
import { testConnection } from '@/db/index.js';
import {
    resolveMigrationTargetForCommand,
    runMigrations,
    verifyCutoverMigration,
    verifyMigrationTarget,
} from '@/db/migrate.js';
import { syncOfficialBrandRegistry } from '@/db/official-brand-registry';
import { closeRealtimeConnection } from '@/db/realtime-connection';
import { prepareJobQueues, startJobs } from '@/jobs/index.js';
import { registerRankWranglerMcp } from '@/mcp/register';
import { registerInternalRouteBoundary } from '@/services/access/internal-access';
import {
    configureRankWranglerAccess,
    createRankWranglerAccess,
} from '@/services/access/rankwrangler-access';
import { collectDueCatalogQueries } from '@/services/catalog-query-refresh';
import { warmDashboard } from '@/services/dashboard-warmup';
import {
    recoverStaleCatalogSearchOperations,
    registerCatalogSearchWakeups,
} from '@/services/catalog-search';
import {
    recoverStaleProductHistoryOperations,
    registerProductHistoryOperationWakeups,
} from '@/services/product-history-operations.js';
import { createDatabaseHealthReaders } from '@/services/service-health-queries.js';
import {
    registerSpApiSyncQueueWakeups,
    sendProcessSpApiSyncQueueJob,
} from '@/services/spapi-sync-queue.js';
import { printStartupSummary } from '@/services/startup-summary';

type JobsRuntime = Awaited<ReturnType<typeof startJobs>>;
const createDisabledJobsRuntime = (): JobsRuntime => {
    return {
        stop: () => Promise.resolve(),
        startupSummary: [],
    };
};

const startServer = async () => {
    console.log('Starting RankWrangler Server...');
    if (process.argv.includes('--verify-migrations') || process.argv.includes('--verify-cutover')) {
        await (process.argv.includes('--verify-cutover')
            ? verifyCutoverMigration()
            : verifyMigrationTarget());
        process.exit(0);
    }

    if (process.env.NODE_ENV !== 'production') {
        assertDevCloudflareAccessTarget({ databaseUrl: buildDatabaseUrl() });
    }

    await runMigrations(
        process.env.MIGRATIONS_FOLDER ?? './drizzle',
        resolveMigrationTargetForCommand(process.argv, env.RANKWRANGLER_DATABASE_MIGRATION_TARGET)
    );

    if (process.argv.includes('--migrate-only')) {
        console.log('[Migration] Migration-only run complete');
        process.exit(0);
    }

    await testConnection();
    console.log('[Server] Verified official-brand registry:', await syncOfficialBrandRegistry());

    const rankwranglerAccess = await createRankWranglerAccess({
        databaseUrl: buildDatabaseUrl(),
        issuer: env.MERCHBASE_ACCESS_ISSUER,
        authorityOrigin: env.MERCHBASE_ACCESS_AUTHORITY_ORIGIN,
        interactiveAudience: env.MERCHBASE_ACCESS_INTERACTIVE_AUDIENCE,
        apiAudience: env.MERCHBASE_ACCESS_API_AUDIENCE,
        internalAudience: env.MERCHBASE_ACCESS_RANKWRANGLER_INTERNAL_AUDIENCE,
        serviceClientId: env.MERCHBASE_ACCESS_RANKWRANGLER_CLIENT_ID,
        serviceClientSecret: env.MERCHBASE_ACCESS_RANKWRANGLER_CLIENT_SECRET,
        authorityClientId: env.MERCHBASE_ACCESS_AUTHORITY_CLIENT_ID,
        bidbeaconClientId: env.MERCHBASE_ACCESS_BIDBEACON_CLIENT_ID,
    });
    configureRankWranglerAccess(rankwranglerAccess);

    const databaseUrl = buildDatabaseUrl();
    const serverRuntimeFlags = getServerRuntimeFlags({
        disableServerJobRunner: env.RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER,
    });
    const boss = new PgBoss({ connectionString: databaseUrl });
    await boss.start();
    console.log('[Server] pg-boss initialized');
    registerSpApiSyncQueueWakeups(boss);
    registerProductHistoryOperationWakeups(boss);
    registerCatalogSearchWakeups(boss);
    console.log(
        `[Server] Runtime flags: RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER=${env.RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER}`
    );

    let recoveredProductHistoryOperationsCount = 0;
    let recoveredCatalogSearchOperationsCount = 0;
    let startedCatalogKeywordRefreshesCount = 0;
    const jobsRuntime = serverRuntimeFlags.shouldStartJobRunner
        ? await startJobs(boss)
        : createDisabledJobsRuntime();

    if (serverRuntimeFlags.shouldStartJobRunner) {
        recoveredProductHistoryOperationsCount = await recoverStaleProductHistoryOperations();
        recoveredCatalogSearchOperationsCount = await recoverStaleCatalogSearchOperations();
        startedCatalogKeywordRefreshesCount = (await collectDueCatalogQueries()).startedCount;

        console.log('[Server] Jobs registered');
        console.log(
            '[Server] Keyword sync (directory, control and Logs push over tRPC WebSocket):',
            (await readAutomaticSync()).paused ? 'Paused' : 'Running'
        );

        // Kick the SP-API sync queue once on startup in case rows exist before the server starts.
        await sendProcessSpApiSyncQueueJob();
    } else {
        await prepareJobQueues(boss);
        console.log('[Server] Job runner disabled; workers, schedules, and startup kicks skipped');
    }

    const fastify = Fastify({
        logger: false, // Disable Pino logger to avoid bundling issues
        // tRPC batches encode procedure names in a single path segment (comma-separated).
        // Fastify defaults maxParamLength to 100, which is too small for multi-query batches.
        maxParamLength: 1000,
    });

    registerInternalRouteBoundary(fastify);

    // Register Fastify plugins
    await fastify.register(helmet);
    await fastify.register(cors, {
        origin: createCorsOriginHandler({ isProduction: process.env.NODE_ENV === 'production' }),
        credentials: true,
    });
    registerInteractiveRequests(fastify);
    const trpcWebsocketServer = registerTrpcWebsocketServer(fastify.server, rankwranglerAccess);
    const handleSnapshot = rankwranglerAccess.projectionHandler(uid => {
        trpcWebsocketServer.disconnectUser(uid);
    });
    fastify.post('/api/internal/access-snapshot', async (request, reply) => {
        if (request.headers.host !== 'rankwrangler-internal.merchbase.co') {
            return reply.code(404).send();
        }
        const headers = new Headers({ 'content-type': request.headers['content-type'] ?? '' });
        const assertion = request.headers['cf-access-jwt-assertion'];
        if (typeof assertion === 'string') {
            headers.set('cf-access-jwt-assertion', assertion);
        }
        const response = await handleSnapshot(
            new Request(`https://rankwrangler-internal.merchbase.co${request.url}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(request.body),
            })
        );
        return reply.code(response.status).send();
    });

    registerRankWranglerMcp({
        access: rankwranglerAccess,
        adminMerchbaseUserId: env.RANKWRANGLER_ADMIN_MERCHBASE_USER_ID,
        fastify,
        issuer: env.MERCHBASE_ACCESS_ISSUER,
    });

    registerHealthRoutes(fastify, createDatabaseHealthReaders());

    registerServerTiming(fastify);
    await fastify.register(fastifyTRPCPlugin, {
        prefix: '/api',
        trpcOptions: {
            router: appRouter,
            createContext: (options: CreateFastifyContextOptions) =>
                timeAuthorization(options.req, () => createContext(options, rankwranglerAccess)),
        },
    });

    fastify.setNotFoundHandler((_request, reply) => {
        reply.status(404);
        return {
            success: false,
            error: 'Route not found',
        };
    });

    fastify.setErrorHandler((error, _request, reply) => {
        console.error(`[${new Date().toISOString()}] Unhandled error:`, error);
        reply.status(500);
        return {
            success: false,
            error: 'Internal server error',
        };
    });

    const port = env.RANKWRANGLER_PORT;
    console.log(`Attempting to start server on port ${port}...`);

    const shutdown = async (signal: string) => {
        console.log(
            `[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`
        );

        try {
            await jobsRuntime.stop();
            console.log('[Server] Job schedules stopped');

            await boss.stop();
            console.log('[Server] pg-boss stopped');

            await trpcWebsocketServer.close();
            await closeRealtimeConnection();
            console.log('[Server] tRPC WebSocket server and notification session closed');

            await fastify.close();
            console.log('[Server] Fastify server closed');

            console.log(`[${new Date().toISOString()}] Shutdown complete`);
            process.exit(0);
        } catch (error) {
            console.error('[Server] Error during shutdown:', error);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    try {
        await fastify.listen({ port, host: '0.0.0.0' });
        warmDashboard().catch(error => console.error('[Server] Dashboard warm-up failed:', error));

        printStartupSummary({
            authSummary: 'Merchbase centralized access (session, OAuth, API key)',
            catalogSearchOperations: serverRuntimeFlags.shouldStartJobRunner
                ? `Enabled (${recoveredCatalogSearchOperationsCount} recovered at startup)`
                : 'Disabled at runtime (job runner disabled)',
            databaseConnected: true,
            developmentIdentityStatus:
                process.env.NODE_ENV === 'development'
                    ? 'Local development principal'
                    : 'Disabled (production)',
            disableServerJobRunner: env.RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER,
            jobRunnerStatus: serverRuntimeFlags.jobRunnerStatus,
            jobStartupSummary: jobsRuntime.startupSummary,
            keepaConfigured: Boolean(env.RANKWRANGLER_KEEPA_API_KEY),
            mcpStatus: 'Cloudflare Managed OAuth /mcp',
            migrationsComplete: true,
            port,
            productFacetSummary: env.RANKWRANGLER_GEMINI_API_KEY
                ? 'Enabled (Gemini 2.5 Flash Lite)'
                : 'Disabled (RANKWRANGLER_GEMINI_API_KEY not set)',
            productHistoryOperations: getProductHistoryOperationsStatus(
                serverRuntimeFlags.shouldStartJobRunner,
                recoveredProductHistoryOperationsCount
            ),
            realtimePath: TRPC_WEBSOCKET_PATH,
            shouldStartJobRunner: serverRuntimeFlags.shouldStartJobRunner,
            startupCatalogKeywordRefreshes: startedCatalogKeywordRefreshesCount,
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer().catch(error => {
    console.error('[Server] Startup failed:', error);
    process.exit(1);
});
