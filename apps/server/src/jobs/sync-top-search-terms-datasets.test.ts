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
    process.env.SPAPI_REFRESH_TOKEN = process.env.SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.SPAPI_CLIENT_ID = process.env.SPAPI_CLIENT_ID ?? 'test-client';
    process.env.SPAPI_APP_CLIENT_SECRET = process.env.SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.LICENSE_SECRET =
        process.env.LICENSE_SECRET ?? '12345678901234567890123456789012';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
};
