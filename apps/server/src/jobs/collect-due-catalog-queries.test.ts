import { describe, expect, it } from 'bun:test';

describe('collectDueCatalogQueriesJob', () => {
    it('runs a singleton minute scan and reports weekly tracking in startup status', async () => {
        const { collectDueCatalogQueriesJob } = await loadSubject();

        expect(collectDueCatalogQueriesJob.sendOptions.singletonKey).toBe(
            'collect-due-catalog-queries'
        );
        expect(collectDueCatalogQueriesJob.schedule).toMatchObject({
            type: 'interval',
            everyMs: 60_000,
        });
        expect(collectDueCatalogQueriesJob.startupSummary).toBe(
            'minute scan for explicitly tracked weekly Catalog queries'
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
    process.env.LICENSE_SECRET =
        process.env.LICENSE_SECRET ?? '12345678901234567890123456789012';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
};
