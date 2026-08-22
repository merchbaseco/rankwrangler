import { describe, expect, it } from 'bun:test';

describe('intervalMsToCronExpression', () => {
    it('maps minute intervals to cron expressions', async () => {
        const { intervalMsToCronExpression } = await loadSubject();

        expect(intervalMsToCronExpression(60 * 1000)).toBe('* * * * *');
        expect(intervalMsToCronExpression(5 * 60 * 1000)).toBe('*/5 * * * *');
        expect(intervalMsToCronExpression(15 * 60 * 1000)).toBe('*/15 * * * *');
    });

    it('maps hour intervals to cron expressions', async () => {
        const { intervalMsToCronExpression } = await loadSubject();

        expect(intervalMsToCronExpression(60 * 60 * 1000)).toBe('0 * * * *');
        expect(intervalMsToCronExpression(2 * 60 * 60 * 1000)).toBe('0 */2 * * *');
        expect(intervalMsToCronExpression(24 * 60 * 60 * 1000)).toBe('0 0 * * *');
    });

    it('throws for non-minute and non-cron-compatible intervals', async () => {
        const { intervalMsToCronExpression } = await loadSubject();

        expect(() => intervalMsToCronExpression(30 * 1000)).toThrow(
            'Interval scheduling must be in whole minutes.'
        );
        expect(() => intervalMsToCronExpression(90 * 60 * 1000)).toThrow(
            'Use .cron() for non-hourly/minute-compatible schedules.'
        );
        expect(() => intervalMsToCronExpression(36 * 60 * 60 * 1000)).toThrow(
            'Use .cron() for non-hourly/minute-compatible schedules.'
        );
    });
});

const loadSubject = async () => {
    seedRequiredEnvForTests();
    return await import('./job-router.js');
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
