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
            'minute scan for admitted keyword heads and bounded discovery'
        );
    });
});

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./collect-due-catalog-queries');
};

const seedRequiredEnvForTests = () => {
    process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN = process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.RANKWRANGLER_SPAPI_CLIENT_ID = process.env.RANKWRANGLER_SPAPI_CLIENT_ID ?? 'test-client';
    process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET = process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES =
        process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES ?? 'https://app.test';
    process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET =
        process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET ?? 'test-webhook-secret';
};
