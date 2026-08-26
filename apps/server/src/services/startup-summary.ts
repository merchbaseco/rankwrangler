export interface StartupSummaryInput {
    authSummary: string;
    catalogSearchOperations: string;
    databaseConnected: boolean;
    devClerkSignInStatus: string;
    disableServerJobRunner: boolean;
    jobRunnerStatus: string;
    jobStartupSummary: string[];
    keepaConfigured: boolean;
    mcpStatus: string;
    migrationsComplete: boolean;
    port: number;
    productFacetSummary: string;
    productHistoryOperations: string;
    realtimePath: string;
    shouldStartJobRunner: boolean;
    startupCatalogKeywordRefreshes: number;
    topSearchTermsRecoveryCount: number;
    topSearchTermsStatus: string;
}

export const printStartupSummary = (input: StartupSummaryInput) => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`[${new Date().toISOString()}] RankWrangler Server Ready`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✓ Server running on port ${input.port}`);
    console.log('✓ Health check endpoint: /api/health');
    console.log('');
    console.log('Status Summary:');
    console.log(`  • Database: ${input.databaseConnected ? 'Connected' : 'Unavailable'}`);
    console.log(`  • Migrations: ${input.migrationsComplete ? 'Complete' : 'Incomplete'}`);
    console.log(`  • Startup Flag RANKWRANGLER_DISABLE_SERVER_JOB_RUNNER: ${input.disableServerJobRunner}`);
    console.log(`  • Job Runner: ${input.jobRunnerStatus}`);
    console.log('  • Job Queues: Connected (pg-boss)');
    if (input.shouldStartJobRunner) {
        console.log('  • Jobs Registered:');
        for (const jobSummary of input.jobStartupSummary) {
            console.log(`    - ${jobSummary}`);
        }
    } else {
        console.log('  • Jobs Registered: Skipped (job runner disabled)');
    }
    console.log(
        `  • Keepa History Sync: ${
            input.keepaConfigured ? 'Configured' : 'Disabled (RANKWRANGLER_KEEPA_API_KEY not set)'
        }`
    );
    console.log('  • Job Execution Tracking: Enabled (admin dashboard)');
    console.log('  • Keepa Queue Log: Enabled (admin dashboard)');
    console.log('  • User Event Logs: Enabled (dashboard logs page)');
    console.log(`  • Top Search Terms: ${input.topSearchTermsStatus}`);
    console.log(
        `  • Top Search Terms Startup Recovery: ${
            input.shouldStartJobRunner
                ? `${input.topSearchTermsRecoveryCount} stale rows reset`
                : 'Skipped (job runner disabled)'
        }`
    );
    console.log(`  • Product History Operations: ${input.productHistoryOperations}`);
    console.log(`  • Catalog Search Operations: ${input.catalogSearchOperations}`);
    console.log(
        `  • Catalog Keyword Refresh: ${
            input.shouldStartJobRunner
                ? `Enabled (${input.startupCatalogKeywordRefreshes} started at startup)`
                : 'Disabled at runtime (job runner disabled)'
        }`
    );
    console.log(`  • Product Facet Classification: ${input.productFacetSummary}`);
    console.log('  • API Routes: tRPC (/api)');
    console.log(`  • Hosted MCP: ${input.mcpStatus}`);
    console.log(`  • Realtime: tRPC WebSocket (${input.realtimePath}, Clerk app)`);
    console.log(`  • Auth: ${input.authSummary}`);
    console.log(`  • Dev Clerk Sign-In Token: ${input.devClerkSignInStatus}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
};

/**
 * What the dev sign-in flow will actually do, rather than what it is meant to.
 *
 * `api.dev.createClerkSignInToken` refuses in production and refuses without a
 * configured user, so a line that always read "Configured" was wrong in exactly
 * the two cases where the reader needed to know. The user id is an opaque
 * development-instance identifier, not a credential, so it is printed; the
 * ticket the procedure mints never is.
 */
export const describeDevClerkSignInStatus = ({
    devSignInUserId,
    isProduction,
}: {
    devSignInUserId: string | undefined;
    isProduction: boolean;
}) => {
    if (isProduction) {
        return 'Disabled (production)';
    }
    if (!devSignInUserId) {
        return 'Disabled (RANKWRANGLER_DEV_CLERK_SIGN_IN_USER_ID not set)';
    }
    return `Configured (${devSignInUserId})`;
};
