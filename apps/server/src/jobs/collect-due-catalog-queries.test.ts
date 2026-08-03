import { describe, expect, it } from 'bun:test';

describe('collectDueCatalogQueriesJob', () => {
    it('runs a singleton minute scan for active keyword refreshes', async () => {
        const { collectDueCatalogQueriesJob } = await loadSubject();

        expect(collectDueCatalogQueriesJob.sendOptions.singletonKey).toBe(
            'collect-due-catalog-queries'
        );
        expect(collectDueCatalogQueriesJob.schedule).toMatchObject({
            type: 'interval',
            everyMs: 60_000,
        });
        expect(collectDueCatalogQueriesJob.startupSummary).toBe(
            'minute scan for active weekly Catalog keyword refreshes'
        );
    });
});

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./collect-due-catalog-queries');
};

const seedRequiredEnvForTests = () => {
    process.env.SPAPI_REFRESH_TOKEN = process.env.SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.SPAPI_CLIENT_ID = process.env.SPAPI_CLIENT_ID ?? 'test-client';
    process.env.SPAPI_APP_CLIENT_SECRET = process.env.SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
    process.env.CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY ?? 'pk_test_rankwrangler';
    process.env.CLERK_JWT_KEY = process.env.CLERK_JWT_KEY ?? 'test-jwt-key';
    process.env.CLERK_ISSUER = process.env.CLERK_ISSUER ?? 'https://clerk.test';
    process.env.CLERK_AUTHORIZED_PARTIES =
        process.env.CLERK_AUTHORIZED_PARTIES ?? 'https://app.test';
    process.env.CLERK_WEBHOOK_SIGNING_SECRET =
        process.env.CLERK_WEBHOOK_SIGNING_SECRET ?? 'test-webhook-secret';
};
