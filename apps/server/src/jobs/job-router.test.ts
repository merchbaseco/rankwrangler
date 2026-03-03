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
    process.env.SPAPI_REFRESH_TOKEN = process.env.SPAPI_REFRESH_TOKEN ?? 'test-refresh';
    process.env.SPAPI_CLIENT_ID = process.env.SPAPI_CLIENT_ID ?? 'test-client';
    process.env.SPAPI_APP_CLIENT_SECRET = process.env.SPAPI_APP_CLIENT_SECRET ?? 'test-secret';
    process.env.LICENSE_SECRET =
        process.env.LICENSE_SECRET ?? '12345678901234567890123456789012';
    process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? 'test-clerk';
};
