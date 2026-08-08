import { describe, expect, it, mock } from 'bun:test';
import type { AgentHistoryResponse } from './product-history-agent';
import {
    getPublicProductHistory,
    type PublicProductHistory,
    type PublicProductHistoryInput,
} from './public-product-history';

describe('public Product-history read model', () => {
    it('projects internal agent history into compact provider-neutral series', async () => {
        const getProductHistorySurface = mock(async () =>
            createAgentHistoryResponse({
                bsr: {
                    unit: 'rank',
                    category: { id: 12_345, name: 'Clothing' },
                    buckets: [
                        ['2026-08-01', 20_000],
                        ['2026-08-02', 12_345],
                    ],
                    summary: {
                        first: 20_000,
                        latest: 12_345,
                        min: 12_345,
                        max: 20_000,
                        count: 2,
                        firstBucketAt: '2026-08-01',
                        latestBucketAt: '2026-08-02',
                    },
                },
                price: {
                    unit: 'minorCurrency',
                    currencyCode: 'USD',
                    valueScale: 100,
                    buckets: [['2026-08-01', 1999]],
                    summary: {
                        first: 1999,
                        latest: 1999,
                        min: 1999,
                        max: 1999,
                        count: 1,
                        firstBucketAt: '2026-08-01',
                        latestBucketAt: '2026-08-01',
                    },
                },
            })
        );
        const input = createInput();

        const result = await getPublicProductHistory(input, { getProductHistorySurface });

        expect(result).toEqual({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B012345678',
            range: {
                startAt: '2026-08-01T00:00:00.000Z',
                endAt: '2026-08-03T00:00:00.000Z',
                interval: 'day',
            },
            series: {
                salesRank: {
                    unit: 'rank',
                    category: { id: 12_345, name: 'Clothing' },
                    points: [
                        ['2026-08-01', 20_000],
                        ['2026-08-02', 12_345],
                    ],
                    summary: {
                        first: 20_000,
                        latest: 12_345,
                        min: 12_345,
                        max: 20_000,
                    },
                },
                price: {
                    unit: 'minorCurrency',
                    currencyCode: 'USD',
                    points: [['2026-08-01', 1999]],
                    summary: {
                        first: 1999,
                        latest: 1999,
                        min: 1999,
                        max: 1999,
                    },
                },
            },
        } satisfies PublicProductHistory);
        expect(result).not.toHaveProperty('status');
        expect(result).not.toHaveProperty('freshness');
        expect(result).not.toHaveProperty('schemaVersion');
        expect(result).not.toHaveProperty('operation');
        expect(getProductHistorySurface.mock.calls[0]?.[0]).toMatchObject({
            marketplaceId: input.marketplaceId,
            asin: input.asin,
            metrics: ['bsr', 'price'],
            format: 'agent',
            refresh: true,
        });
    });

    it('returns empty requested series with nullable summaries', async () => {
        const getProductHistorySurface = mock(async () =>
            createAgentHistoryResponse({
                bsr: {
                    unit: 'rank',
                    category: null,
                    buckets: [],
                    summary: emptySummary(),
                },
                price: {
                    unit: 'minorCurrency',
                    currencyCode: 'USD',
                    valueScale: 100,
                    buckets: [],
                    summary: emptySummary(),
                },
                status: 'empty',
            })
        );

        const result = await getPublicProductHistory(createInput(), { getProductHistorySurface });

        expect(result.series.salesRank?.points).toEqual([]);
        expect(result.series.salesRank?.summary).toEqual(emptyPublicSummary());
        expect(result.series.price?.points).toEqual([]);
        expect(result.series.price?.summary).toEqual(emptyPublicSummary());
    });
});

const createInput = (): PublicProductHistoryInput => ({
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B012345678',
    metrics: ['salesRank', 'price'],
    bucket: 'day',
    days: 30,
    limit: 5000,
    startAt: new Date('2026-08-01T00:00:00.000Z'),
    endAt: new Date('2026-08-03T00:00:00.000Z'),
    ownerMerchbaseUserId: 'mbu_test',
});

const createAgentHistoryResponse = (
    overrides: Partial<AgentHistoryResponse['series']> & {
        status?: AgentHistoryResponse['status'];
    }
) =>
    ({
        schemaVersion: 2 as const,
        marketplaceId: 'ATVPDKIKX0DER',
        asin: 'B012345678',
        status: overrides.status ?? ('ready' as const),
        freshness: { stale: false, updatedAt: '2026-08-03T12:00:00.000Z' },
        range: {
            startAt: '2026-08-01T00:00:00.000Z',
            endAt: '2026-08-03T00:00:00.000Z',
            bucket: 'day' as const,
        },
        series: {
            ...overrides,
            status: undefined,
        },
    }) as AgentHistoryResponse;

const emptySummary = () => ({
    first: null,
    latest: null,
    min: null,
    max: null,
    count: 0,
    firstBucketAt: null,
    latestBucketAt: null,
});

const emptyPublicSummary = () => ({
    first: null,
    latest: null,
    min: null,
    max: null,
});
