import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import { PgBoss } from 'pg-boss';
import { createContext } from '@/api/context.js';
import { appRouter } from '@/api/router.js';
import { registerTrpcWebsocketServer, TRPC_WEBSOCKET_PATH } from '@/api/trpc-websocket-server';
import { createCorsOriginHandler } from '@/config/cors-origin';
import { env } from '@/config/env.js';
import {
    getProductHistoryOperationsStatus,
    getServerRuntimeFlags,
} from '@/config/server-runtime.js';
import { testConnection } from '@/db/index.js';
import {
    resolveMigrationTargetForCommand,
    runMigrations,
    verifyMigrationTarget,
} from '@/db/migrate.js';
import { recoverStaleTopSearchTermsDatasets } from '@/db/top-search-terms/datasets.js';
import { prepareJobQueues, startJobs } from '@/jobs/index.js';
import { registerRankWranglerMcp } from '@/mcp/register';
import {
    bootstrapAccessProjection,
    parseProjectionBootstrapOptions,
} from '@/scripts/central-auth-projection-bootstrap';
import { registerClerkAccessWebhookRoute } from '@/services/access/clerk-webhook-route';
import {
    configureRankWranglerAccess,
    createRankWranglerAccess,
} from '@/services/access/rankwrangler-access';
import { collectDueCatalogQueries } from '@/services/catalog-query-refresh';
import {
    recoverStaleCatalogSearchOperations,
    registerCatalogSearchWakeups,
} from '@/services/catalog-search';
import {
    recoverStaleProductHistoryOperations,
    registerProductHistoryOperationWakeups,
} from '@/services/product-history-operations.js';
import { SPAPI_US_MARKETPLACE_ID } from '@/services/spapi/marketplaces.js';
import {
    registerSpApiSyncQueueWakeups,
    sendProcessSpApiSyncQueueJob,
} from '@/services/spapi-sync-queue.js';
import { printStartupSummary } from '@/services/startup-summary';
import {
    getTopSearchTermsFetchStaleActiveJobCutoff,
    registerTopSearchTermsJobWakeups,
    sendSyncTopSearchTermsDatasetsJob,
} from '@/services/top-search-terms-jobs.js';

type JobsRuntime = Awaited<ReturnType<typeof startJobs>>;
const createDisabledJobsRuntime = (): JobsRuntime => {
    return {
        stop: () => Promise.resolve(),
        startupSummary: [],
    };
};

console.log('Starting RankWrangler Server...');

if (process.argv.includes('--verify-migrations')) {
    await verifyMigrationTarget();
    process.exit(0);
}

const shouldBootstrapAccessProjection = process.argv.includes('--bootstrap-access-projection');

await runMigrations(
    process.env.MIGRATIONS_FOLDER ?? './drizzle',
    resolveMigrationTargetForCommand(process.argv, env.RANKWRANGLER_DATABASE_MIGRATION_TARGET)
);

if (process.argv.includes('--migrate-only')) {
    console.log('[Migration] Migration-only run complete');
    process.exit(0);
}

await testConnection();

const rankwranglerAccess = createRankWranglerAccess({
    authorizedParties: env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES.split(',')
        .map(value => value.trim())
        .filter(Boolean),
    issuer: env.MERCHBASE_CLERK_ISSUER,
    jwtKey: env.MERCHBASE_CLERK_JWT_KEY,
    publishableKey: env.MERCHBASE_CLERK_PUBLISHABLE_KEY,
    secretKey: env.MERCHBASE_CLERK_SECRET_KEY,
});
configureRankWranglerAccess(rankwranglerAccess);

if (shouldBootstrapAccessProjection) {
    const options = parseProjectionBootstrapOptions(
        process.argv.slice(2).filter(argument => argument !== '--bootstrap-access-projection')
    );
    const result = await bootstrapAccessProjection(options, {
        authenticator: rankwranglerAccess.authenticator,
        issuer: env.MERCHBASE_CLERK_ISSUER,
        store: rankwranglerAccess.projections,
    });
    console.log(JSON.stringify({ mode: 'projection-bootstrap', ...result }, null, 2));
    process.exit(0);
}

const databaseUser = env.RANKWRANGLER_DATABASE_USER || 'rankwrangler';
const databasePassword = env.RANKWRANGLER_DATABASE_PASSWORD || 'SecurePass123';
const databaseHost = env.RANKWRANGLER_DATABASE_HOST || 'postgres';
const databasePort = env.RANKWRANGLER_DATABASE_PORT || 5432;
const databaseName = env.RANKWRANGLER_DATABASE_NAME || 'rankwrangler';
const databaseUrl =
    `postgresql://${databaseUser}:${databasePassword}` +
    `@${databaseHost}:${databasePort}/${databaseName}`;
const serverRuntimeFlags = getServerRuntimeFlags({
    disableServerJobRunner: env.RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER,
});
const boss = new PgBoss({ connectionString: databaseUrl });
await boss.start();
console.log('[Server] pg-boss initialized');
registerSpApiSyncQueueWakeups(boss);
registerTopSearchTermsJobWakeups(boss);
registerProductHistoryOperationWakeups(boss);
registerCatalogSearchWakeups(boss);
console.log(`[Server] Runtime flags: RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER=${env.RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER}`);

let recoveredTopSearchTermsDatasetsCount = 0;
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
    const topSearchTermsRecoveryStartedAt = new Date();
    const topSearchTermsStaleActiveJobCutoff = getTopSearchTermsFetchStaleActiveJobCutoff(
        topSearchTermsRecoveryStartedAt
    );
    recoveredTopSearchTermsDatasetsCount = await recoverStaleTopSearchTermsDatasets({
        marketplaceId: SPAPI_US_MARKETPLACE_ID,
        staleActiveJobCutoff: topSearchTermsStaleActiveJobCutoff,
        recoveredAt: topSearchTermsRecoveryStartedAt,
    });
    if (recoveredTopSearchTermsDatasetsCount > 0) {
        console.warn(
            `[Server] Recovered ${recoveredTopSearchTermsDatasetsCount} stale Top Search Terms datasets at startup`
        );
    }

    console.log('[Server] Jobs registered');

    // Kick the SP-API sync queue once on startup in case rows exist before the server starts.
    await sendProcessSpApiSyncQueueJob();
    await sendSyncTopSearchTermsDatasetsJob();
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

// Register Fastify plugins
await fastify.register(helmet);
await fastify.register(cors, {
    origin: createCorsOriginHandler({ isProduction: process.env.NODE_ENV === 'production' }),
    credentials: true,
});
await registerClerkAccessWebhookRoute(fastify, {
    issuer: env.MERCHBASE_CLERK_ISSUER,
    onIdentityChanged: identity => rankwranglerAccess.authenticator.invalidateApiKeys(identity),
    signingSecret: env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET,
    store: rankwranglerAccess.projections,
});
const trpcWebsocketServer = registerTrpcWebsocketServer(fastify.server, rankwranglerAccess);

registerRankWranglerMcp({
    access: rankwranglerAccess,
    adminMerchbaseUserId: env.RANKWRANGLER_ADMIN_MERCHBASE_USER_ID,
    fastify,
    publishableKey: env.MERCHBASE_CLERK_PUBLISHABLE_KEY,
});

fastify.get('/api/health', () => {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'rankwrangler-server',
    };
});

await fastify.register(fastifyTRPCPlugin, {
    prefix: '/api',
    trpcOptions: {
        router: appRouter,
        createContext: (options: CreateFastifyContextOptions) =>
            createContext(options, rankwranglerAccess),
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

// Graceful shutdown handler
const shutdown = async (signal: string) => {
    console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);

    try {
        // Stop job intervals
        await jobsRuntime.stop();
        console.log('[Server] Job schedules stopped');

        // Stop pg-boss
        await boss.stop();
        console.log('[Server] pg-boss stopped');

        // Close Fastify server
        await trpcWebsocketServer.close();
        console.log('[Server] tRPC WebSocket server closed');

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

    printStartupSummary({
        authSummary: 'Merchbase centralized access (session, OAuth, API key)',
        catalogSearchOperations: serverRuntimeFlags.shouldStartJobRunner
            ? `Enabled (${recoveredCatalogSearchOperationsCount} recovered at startup)`
            : 'Disabled at runtime (job runner disabled)',
        databaseConnected: true,
        disableServerJobRunner: env.RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER,
        jobRunnerStatus: serverRuntimeFlags.jobRunnerStatus,
        jobStartupSummary: jobsRuntime.startupSummary,
        keepaConfigured: Boolean(env.RANKWRANGLER_KEEPA_API_KEY),
        mcpStatus: env.MERCHBASE_CLERK_PUBLISHABLE_KEY
            ? 'Enabled (/mcp, OAuth bearer)'
            : 'Disabled (MERCHBASE_CLERK_PUBLISHABLE_KEY not set)',
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
        topSearchTermsRecoveryCount: recoveredTopSearchTermsDatasetsCount,
        topSearchTermsStatus: serverRuntimeFlags.shouldStartJobRunner
            ? 'Enabled (dataset scheduler + fetch worker)'
            : 'Disabled at runtime (job runner disabled)',
    });
} catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
}
