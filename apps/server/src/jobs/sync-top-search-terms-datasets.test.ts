import { describe, expect, it } from 'bun:test';

describe('syncTopSearchTermsDatasetsJob', () => {
    it('runs every 5 minutes with a singleton wakeup key', async () => {
        const { syncTopSearchTermsDatasetsJob } = await loadSubject();

        expect(syncTopSearchTermsDatasetsJob.persistSuccess).toBe('didWork');
        expect(syncTopSearchTermsDatasetsJob.startupSummary).toBe('cron: every 5m');
        expect(syncTopSearchTermsDatasetsJob.schedule).toEqual({
            type: 'cron',
            cron: '*/5 * * * *',
            payload: {},
            scheduleOptions: undefined,
        });
        expect(syncTopSearchTermsDatasetsJob.sendOptions.singletonKey).toBe(
            'sync-top-search-terms-datasets'
        );
        expect(syncTopSearchTermsDatasetsJob.sendOptions.retryLimit).toBe(0);
    });
});

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./sync-top-search-terms-datasets.js');
};

const seedRequiredEnvForTests = () => {
    process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN = process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.RANKWRANGLER_SPAPI_CLIENT_ID = process.env.RANKWRANGLER_SPAPI_CLIENT_ID ?? 'test-client';
    process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET = process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.MERCHBASE_CLERK_SECRET_KEY = process.env.MERCHBASE_CLERK_SECRET_KEY ?? 'test-clerk';
    process.env.MERCHBASE_CLERK_PUBLISHABLE_KEY = process.env.MERCHBASE_CLERK_PUBLISHABLE_KEY ?? 'pk_test_rankwrangler';
    process.env.MERCHBASE_CLERK_JWT_KEY = process.env.MERCHBASE_CLERK_JWT_KEY ?? 'test-jwt-key';
    process.env.MERCHBASE_CLERK_ISSUER = process.env.MERCHBASE_CLERK_ISSUER ?? 'https://clerk.test';
    process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES =
        process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES ?? 'https://app.test';
    process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET =
        process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET ?? 'test-webhook-secret';
};
