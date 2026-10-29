import { beforeEach, describe, expect, it } from 'bun:test';
import { and, gte, lte } from 'drizzle-orm';
import { db } from '@/db/index';
import { providerAttempts } from '@/db/provider-telemetry-schema';
import { probeProviderDown } from '@/services/service-health-queries';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const probeKeepa = probeProviderDown('keepa');

describe.skipIf(process.env.RUN_CATALOG_DB_TESTS !== 'true')('provider health probe', () => {
    beforeEach(async () => {
        await db
            .delete(providerAttempts)
            .where(
                and(
                    gte(providerAttempts.attemptedAt, minutesAgo(60)),
                    lte(providerAttempts.attemptedAt, NOW)
                )
            );
    });

    it('passes a provider with no recent calls', async () => {
        expect(await probeKeepa(NOW)).toBe(false);
    });
    it('passes fewer failed calls than the minimum', async () => {
        await insertAttempts([{ isError: true, statusCode: 500 }, { isError: true, statusCode: null }]);

        expect(await probeKeepa(NOW)).toBe(false);
    });
    it('fails when every call in the window errored', async () => {
        await insertAttempts([
            { isError: true, statusCode: 500 },
            { isError: true, statusCode: 401 },
            { isError: true, statusCode: null },
        ]);

        expect(await probeKeepa(NOW)).toBe(true);
    });
    it('passes errors once a single call succeeded', async () => {
        await insertAttempts([
            { isError: true, statusCode: 500 },
            { isError: true, statusCode: 500 },
            { isError: false, statusCode: 200 },
        ]);

        expect(await probeKeepa(NOW)).toBe(false);
    });
    it('treats a 429 as an answer, not an outage', async () => {
        await insertAttempts([
            { isError: true, statusCode: 429 },
            { isError: true, statusCode: 429 },
            { isError: true, statusCode: 429 },
        ]);

        expect(await probeKeepa(NOW)).toBe(false);
    });
    it('ignores failures older than the window and other providers', async () => {
        await insertAttempts(
            [
                { isError: true, statusCode: 500 },
                { isError: true, statusCode: 500 },
                { isError: true, statusCode: 500 },
            ],
            minutesAgo(20)
        );
        await insertAttempts(
            [
                { isError: true, statusCode: 500 },
                { isError: true, statusCode: 500 },
                { isError: true, statusCode: 500 },
            ],
            minutesAgo(1),
            'spapi'
        );

        expect(await probeKeepa(NOW)).toBe(false);
        expect(await probeProviderDown('spapi')(NOW)).toBe(true);
    });
});

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE_MS);

const insertAttempts = async (
    attempts: readonly { isError: boolean; statusCode: number | null }[],
    attemptedAt = minutesAgo(1),
    provider: 'keepa' | 'spapi' = 'keepa'
) => {
    await db.insert(providerAttempts).values(
        attempts.map(attempt => ({
            ...attempt,
            attemptedAt,
            latencyMs: 100,
            operation: provider === 'keepa' ? 'keepa.product' : 'spapi.catalog.search',
            provider,
        }))
    );
};
