import { describe, expect, it, mock } from 'bun:test';
import { TRPCError } from '@trpc/server';
import { runManualProductHistorySync } from './load-product-history.js';

type SyncDeps = NonNullable<Parameters<typeof runManualProductHistorySync>[0]['deps']>;

const input = {
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B012345678',
    days: 365,
};

const actor = 'reviewer@example.com';

describe('runManualProductHistorySync', () => {
    it('ensures product info exists before running manual Keepa sync', async () => {
        let didEnsureProductInfo = false;
        const deps = createDeps({
            fetchProductInfo: async params => {
                didEnsureProductInfo = true;
                expect(params).toEqual({
                    marketplaceId: input.marketplaceId,
                    asin: input.asin,
                    uid: actor,
                    endpoint: 'api.app.loadProductHistory',
                });
                return createProductInfoResult();
            },
            loadKeepaProductHistoryManually: async () => {
                expect(didEnsureProductInfo).toBe(true);
                return createKeepaImportSummary();
            },
        });

        const summary = await runManualProductHistorySync({
            input,
            actor,
            deps,
        });

        expect(summary.status).toBe('success');
        expect(deps.fetchProductInfo.mock.calls).toHaveLength(1);
        expect(deps.loadKeepaProductHistoryManually.mock.calls).toHaveLength(1);
        expect(deps.createEventLogSafe.mock.calls).toHaveLength(1);
        const successLog = deps.createEventLogSafe.mock.calls[0]?.[0] as {
            status: string;
            detailsJson: Record<string, unknown>;
        };
        expect(successLog.status).toBe('success');
        expect(successLog.detailsJson.actor).toBe(actor);
    });

    it('logs and rethrows when product info ensure fails', async () => {
        const ensureError = new TRPCError({
            code: 'TIMEOUT',
            message: 'Request timeout: product info not available after 10 seconds',
        });
        const deps = createDeps({
            fetchProductInfo: async () => {
                throw ensureError;
            },
        });

        await expect(
            runManualProductHistorySync({
                input,
                actor,
                deps,
            })
        ).rejects.toThrow('Request timeout: product info not available after 10 seconds');

        expect(deps.fetchProductInfo.mock.calls).toHaveLength(1);
        expect(deps.loadKeepaProductHistoryManually.mock.calls).toHaveLength(0);
        expect(deps.createEventLogSafe.mock.calls).toHaveLength(1);
        const failedLog = deps.createEventLogSafe.mock.calls[0]?.[0] as {
            status: string;
            detailsJson: Record<string, unknown>;
        };
        expect(failedLog.status).toBe('failed');
        expect(failedLog.detailsJson.actor).toBe(actor);
        expect(failedLog.detailsJson.error).toBe(
            'Request timeout: product info not available after 10 seconds'
        );
    });
});

const createDeps = ({
    createEventLogSafe = async () => {},
    fetchProductInfo = async () => createProductInfoResult(),
    loadKeepaProductHistoryManually = async () => createKeepaImportSummary(),
}: {
    createEventLogSafe?: SyncDeps['createEventLogSafe'];
    fetchProductInfo?: SyncDeps['fetchProductInfo'];
    loadKeepaProductHistoryManually?: SyncDeps['loadKeepaProductHistoryManually'];
} = {}): SyncDeps => {
    return {
        createEventLogSafe: mock(createEventLogSafe),
        fetchProductInfo: mock(fetchProductInfo),
        loadKeepaProductHistoryManually: mock(loadKeepaProductHistoryManually),
    };
};

const createProductInfoResult = () => ({
    asin: input.asin,
    marketplaceId: input.marketplaceId,
    dateFirstAvailable: '2026-01-01T00:00:00.000Z',
    title: 'Example Product',
    brand: 'Example',
    isMerchListing: true,
    bullet1: 'Bullet 1',
    bullet2: 'Bullet 2',
    thumbnailUrl: undefined,
    rootCategoryId: 7141123011,
    rootCategoryBsr: 12345,
    rootCategoryDisplayName: 'Clothing',
    metadata: {
        lastFetched: '2026-03-05T00:00:00.000Z',
        cached: true,
    },
});

const createKeepaImportSummary = () => ({
    importId: 'import-123',
    marketplaceId: input.marketplaceId,
    asin: input.asin,
    days: input.days,
    pointsStored: 42,
    pointCounts: {},
    tokensConsumed: 2,
    tokensLeft: 100,
    refillInMs: 60000,
    refillRate: 5,
    status: 'success' as const,
    cached: false,
    importedAt: '2026-03-05T00:00:00.000Z',
    errorCode: null,
    errorMessage: null,
    responsePayload: null,
});
