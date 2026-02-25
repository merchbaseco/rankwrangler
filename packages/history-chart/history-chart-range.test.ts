import { describe, expect, it } from 'bun:test';
import {
    AMAZON_US_TIME_ZONE,
    buildHistoryQueryRange,
    resolveCustomTimeDomain,
    resolveTimeDomainForSelection,
} from './history-chart-range';
import { buildHistoryChartState } from './history-chart-utils';

describe('resolveCustomTimeDomain', () => {
    it('resolves a single-day custom range to full Pacific-day bounds', () => {
        const domain = resolveCustomTimeDomain(
            [new Date(2026, 1, 25), new Date(2026, 1, 25)],
            AMAZON_US_TIME_ZONE,
        );

        expect(domain).toEqual({
            startAt: Date.parse('2026-02-25T08:00:00.000Z'),
            endAt: Date.parse('2026-02-26T07:59:59.999Z'),
        });
    });

    it('normalizes reversed custom ranges before resolving bounds', () => {
        const domain = resolveCustomTimeDomain(
            [new Date(2026, 1, 27), new Date(2026, 1, 25)],
            AMAZON_US_TIME_ZONE,
        );

        expect(domain).toEqual({
            startAt: Date.parse('2026-02-25T08:00:00.000Z'),
            endAt: Date.parse('2026-02-28T07:59:59.999Z'),
        });
    });

    it('handles Pacific DST offset shifts across selected days', () => {
        const domain = resolveCustomTimeDomain(
            [new Date(2026, 2, 8), new Date(2026, 2, 9)],
            AMAZON_US_TIME_ZONE,
        );

        expect(domain).toEqual({
            startAt: Date.parse('2026-03-08T08:00:00.000Z'),
            endAt: Date.parse('2026-03-10T06:59:59.999Z'),
        });
    });
});

describe('resolveTimeDomainForSelection', () => {
    it('returns null for all-time preset', () => {
        expect(
            resolveTimeDomainForSelection({
                activeRange: 'all',
                customRange: null,
            }),
        ).toBeNull();
    });

    it('uses preset windows for non-custom selections', () => {
        const now = Date.UTC(2026, 1, 25, 12, 0, 0);
        const domain = resolveTimeDomainForSelection({
            activeRange: '30d',
            customRange: null,
            referenceTimeMs: now,
        });

        expect(domain).toEqual({
            startAt: now - 30 * 24 * 60 * 60 * 1000,
            endAt: now,
        });
    });
});

describe('buildHistoryQueryRange', () => {
    it('returns start/end for custom ranges and start-only for presets', () => {
        const customDomain = {
            startAt: Date.parse('2026-02-25T08:00:00.000Z'),
            endAt: Date.parse('2026-02-26T07:59:59.999Z'),
        };
        expect(
            buildHistoryQueryRange({
                activeRange: 'custom',
                timeDomain: customDomain,
            }),
        ).toEqual({
            startAt: '2026-02-25T08:00:00.000Z',
            endAt: '2026-02-26T07:59:59.999Z',
        });

        expect(
            buildHistoryQueryRange({
                activeRange: '90d',
                timeDomain: customDomain,
            }),
        ).toEqual({
            startAt: '2026-02-25T08:00:00.000Z',
        });
    });
});

describe('buildHistoryChartState with custom domains', () => {
    it('includes points observed on the selected Pacific end date', () => {
        const domain = resolveCustomTimeDomain(
            [new Date(2026, 1, 25), new Date(2026, 1, 25)],
            AMAZON_US_TIME_ZONE,
        );
        if (!domain) {
            throw new Error('Expected custom domain');
        }

        const state = buildHistoryChartState({
            points: [
                { timestamp: Date.parse('2026-02-26T07:30:00.000Z'), value: 100 },
                { timestamp: Date.parse('2026-02-26T08:30:00.000Z'), value: 200 },
            ],
            timeDomain: domain,
        });

        expect(state.displayPoints.some((point) => point.value === 100)).toBe(true);
        expect(state.displayPoints.some((point) => point.value === 200)).toBe(false);
    });

    it('returns empty chart state when no points exist in a selected range', () => {
        const domain = resolveCustomTimeDomain(
            [new Date(2026, 1, 25), new Date(2026, 1, 25)],
            AMAZON_US_TIME_ZONE,
        );
        if (!domain) {
            throw new Error('Expected custom domain');
        }

        const state = buildHistoryChartState({
            points: [],
            timeDomain: domain,
        });

        expect(state.hasData).toBe(false);
        expect(state.displayPoints).toEqual([]);
        expect(state.sampledPoints).toEqual([]);
    });
});
