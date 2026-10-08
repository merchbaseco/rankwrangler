import { describe, expect, it, mock } from 'bun:test';
import { SpApiLimiterWaitError } from '@/services/providers/sp-api/sp-api-limiter-wait';

type ProcessSpApiSyncQueueDeps = NonNullable<
    Parameters<typeof import('./process-spapi-sync-queue')['processSpApiSyncQueue']>[0]
>;

describe('processSpApiSyncQueue deadline', () => {
    it('fails a stalled Catalog batch with the named deadline error instead of hanging', async () => {
        const { processSpApiSyncQueue, SpApiSyncBatchDeadlineError } = await loadSubject();
        const { deps, createEventLogsSafe } = createDeps({
            asin: 'B0DEADLN01',
            searchCatalogItemsByAsins: () => new Promise<never>(() => undefined),
        });

        const error = await silenceConsoleError(() =>
            processSpApiSyncQueue(deps).catch((caught: unknown) => caught)
        );

        expect(error).toBeInstanceOf(SpApiSyncBatchDeadlineError);
        expect((error as Error).message).toContain('catalog.searchCatalogItems');
        const [logs] = createEventLogsSafe.mock.calls[0] as unknown as [
            Array<{ detailsJson: { stage: string; error: string } }>,
        ];
        expect(logs[0]?.detailsJson).toMatchObject({
            stage: 'fetch',
            error: (error as Error).message,
        });
    });

    it('surfaces a wedged-limiter error by name rather than as a retryable refresh', async () => {
        const { processSpApiSyncQueue } = await loadSubject();
        const waitError = new SpApiLimiterWaitError({
            operationId: 'catalog.searchCatalogItems',
            label: 'Catalog Search',
            maxQueueWaitMs: 120_000,
        });
        const { deps } = createDeps({
            asin: 'B0DEADLN02',
            searchCatalogItemsByAsins: () => Promise.reject(waitError),
        });

        const error = await silenceConsoleError(() =>
            processSpApiSyncQueue(deps).catch((caught: unknown) => caught)
        );

        expect(error).toBe(waitError);
    });
});

const createDeps = ({
    asin,
    searchCatalogItemsByAsins,
}: {
    asin: string;
    searchCatalogItemsByAsins: () => Promise<never>;
}) => {
    const createEventLogsSafe = mock(() => Promise.resolve(undefined));
    const deps = {
        getSpApiSyncQueueItems: mock(async () => [
            {
                id: `queue-${asin}`,
                marketplaceId: 'ATVPDKIKX0DER',
                asin,
                createdAt: new Date('2026-08-03T12:00:00.000Z'),
            },
        ]),
        searchCatalogItemsByAsins,
        persistProductSyncResults: mock(() => Promise.resolve(undefined)),
        deleteSpApiSyncQueueItems: mock(() => Promise.resolve(undefined)),
        createEventLogsSafe,
        notifyProductSyncCompleted: mock(() => undefined),
        batchDeadlineMs: 20,
    } as unknown as ProcessSpApiSyncQueueDeps;
    return { deps, createEventLogsSafe };
};

const silenceConsoleError = async <T>(run: () => Promise<T>) => {
    const original = console.error;
    console.error = () => undefined;
    try {
        return await run();
    } finally {
        console.error = original;
    }
};

const loadSubject = async () => {
    process.env.RANKWRANGLER_SPAPI_REFRESH_TOKEN ??= 'test-refresh';
    process.env.RANKWRANGLER_SPAPI_CLIENT_ID ??= 'test-client';
    process.env.RANKWRANGLER_SPAPI_APP_CLIENT_SECRET ??= 'test-secret';
    process.env.MERCHBASE_CLERK_SECRET_KEY ??= 'test-clerk';
    process.env.MERCHBASE_CLERK_PUBLISHABLE_KEY ??= 'pk_test_rankwrangler';
    process.env.MERCHBASE_CLERK_JWT_KEY ??= 'test-jwt-key';
    process.env.MERCHBASE_CLERK_ISSUER ??= 'https://clerk.test';
    process.env.RANKWRANGLER_CLERK_AUTHORIZED_PARTIES ??= 'https://app.test';
    process.env.RANKWRANGLER_CLERK_WEBHOOK_SIGNING_SECRET ??= 'test-webhook-secret';
    return await import('./process-spapi-sync-queue');
};
