import { describe, expect, test } from 'bun:test';
import { buildAgentHistoryResponse, resolveAgentHistoryWindow } from './product-history-agent.js';
import { resolveProductHistorySyncDays } from './product-history-sync-days.js';

describe('product history agent response', () => {
    test('auto buckets a one-month range by day', () => {
        const response = buildAgentHistoryResponse({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B0DV53VS61',
            requestedBucket: 'auto',
            requestedMetrics: ['bsr'],
            startAt: new Date('2026-01-01T00:00:00.000Z'),
            endAt: new Date('2026-01-31T23:59:59.999Z'),
            collecting: false,
            syncTriggered: false,
            operation: null,
            resultsByMetric: {
                bsr: {
                    latestImportAt: '2026-01-31T12:00:00.000Z',
                    categoryNames: { '123': 'Novelty Clothing' },
                    points: [
                        point('2026-01-01T12:00:00.000Z', 123, 120000),
                        point('2026-01-15T12:00:00.000Z', 123, 90000),
                        point('2026-01-31T12:00:00.000Z', 123, 110000),
                    ],
                },
            },
        });

        expect(response.schemaVersion).toBe(2);
        expect(response.status).toBe('ready');
        expect(response.range.bucket).toBe('day');
        expect(response.series.bsr?.summary).toMatchObject({
            first: 120000,
            latest: 110000,
            min: 90000,
            max: 120000,
        });
    });

    test('auto buckets a one-year range by week', () => {
        const response = buildAgentHistoryResponse({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B0DV53VS61',
            requestedBucket: 'auto',
            requestedMetrics: ['bsr'],
            startAt: new Date('2025-01-01T00:00:00.000Z'),
            endAt: new Date('2026-01-01T00:00:00.000Z'),
            collecting: false,
            syncTriggered: false,
            operation: null,
            resultsByMetric: {
                bsr: {
                    latestImportAt: '2026-01-01T12:00:00.000Z',
                    categoryNames: {},
                    points: [
                        point('2025-01-01T12:00:00.000Z', 123, 300000),
                        point('2025-07-01T12:00:00.000Z', 123, 150000),
                        point('2026-01-01T12:00:00.000Z', 123, 200000),
                    ],
                },
            },
        });

        expect(response.range.bucket).toBe('week');
        expect(response.series.bsr?.buckets.length).toBeLessThanOrEqual(54);
    });

    test('resolves days into an agent date window', () => {
        const window = resolveAgentHistoryWindow({
            days: 30,
            now: new Date('2026-02-01T00:00:00.000Z'),
        });

        expect(window.startAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
        expect(window.endAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    });

    test('sync days cover explicit old ranges', () => {
        const days = resolveProductHistorySyncDays(
            {
                startAt: new Date('2024-01-01T00:00:00.000Z'),
                days: 365,
            },
            null,
            new Date('2026-01-01T00:00:00.000Z')
        );

        expect(days).toBe(731);
    });

    test('keeps missing price buckets as null', () => {
        const response = buildAgentHistoryResponse({
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B0DV53VS61',
            requestedBucket: 'day',
            requestedMetrics: ['price'],
            startAt: new Date('2026-01-01T00:00:00.000Z'),
            endAt: new Date('2026-01-03T23:59:59.999Z'),
            collecting: false,
            syncTriggered: false,
            operation: null,
            resultsByMetric: {
                price: {
                    latestImportAt: '2026-01-03T12:00:00.000Z',
                    categoryNames: {},
                    points: [
                        pricePoint('2026-01-01T12:00:00.000Z', 1999),
                        missingPoint('2026-01-02T12:00:00.000Z'),
                        pricePoint('2026-01-03T12:00:00.000Z', 2199),
                    ],
                },
            },
        });

        expect(response.series.price?.buckets).toEqual([
            ['2026-01-01', 1999],
            ['2026-01-02', null],
            ['2026-01-03', 2199],
        ]);
    });
});

const point = (observedAt: string, categoryId: number, value: number) => ({
    categoryId,
    categoryName: null,
    observedAt,
    keepaMinutes: 0,
    value,
    isMissing: false,
});

const pricePoint = (observedAt: string, value: number) => point(observedAt, -1, value);

const missingPoint = (observedAt: string) => ({
    categoryId: -1,
    categoryName: null,
    observedAt,
    keepaMinutes: 0,
    value: null,
    isMissing: true,
});
