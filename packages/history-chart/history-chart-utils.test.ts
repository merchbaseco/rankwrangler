import { describe, expect, it } from 'bun:test';
import {
    buildHistoryChartState,
    formatDateTooltip,
    normalizeHistoryPoints,
    resolveTimeDomainForPreset,
} from './history-chart-utils';

describe('formatDateTooltip', () => {
    it('formats hovered point dates with month day and full year', () => {
        const timestamp = Date.parse('2026-02-24T20:00:00.000Z');
        expect(formatDateTooltip(timestamp)).toBe('Feb 24, 2026');
    });

    it('formats end-of-day timestamps using Pacific date boundaries', () => {
        const timestamp = Date.parse('2026-02-26T07:59:59.999Z');
        expect(formatDateTooltip(timestamp)).toBe('Feb 25, 2026');
    });
});

describe('resolveTimeDomainForPreset', () => {
    it('returns null for all-time', () => {
        expect(resolveTimeDomainForPreset('all')).toBeNull();
    });

    it('builds a fixed-day window for bounded presets', () => {
        const now = Date.UTC(2026, 1, 25, 12, 0, 0);
        const domain = resolveTimeDomainForPreset('30d', now);
        expect(domain).toEqual({
            startAt: now - 30 * 24 * 60 * 60 * 1000,
            endAt: now,
        });
    });
});

describe('buildHistoryChartState', () => {
    it('keeps an anchor point at the start of a selected range', () => {
        const points = [
            { timestamp: Date.UTC(2026, 0, 1), value: 1000 },
            { timestamp: Date.UTC(2026, 0, 20), value: 900 },
        ];

        const state = buildHistoryChartState({
            points,
            timeDomain: {
                startAt: Date.UTC(2026, 0, 10),
                endAt: Date.UTC(2026, 0, 30),
            },
        });

        expect(state.displayPoints[0]).toEqual({
            timestamp: Date.UTC(2026, 0, 10),
            value: 1000,
        });
        expect(state.displayPoints.at(-1)).toEqual({
            timestamp: Date.UTC(2026, 0, 30),
            value: 900,
        });
    });
});

describe('normalizeHistoryPoints', () => {
    it('filters missing/invalid points and returns ascending timestamps', () => {
        const normalized = normalizeHistoryPoints([
            { isMissing: false, observedAt: '2026-01-03T00:00:00.000Z', value: 300 },
            { isMissing: true, observedAt: '2026-01-02T00:00:00.000Z', value: 200 },
            { isMissing: false, observedAt: 'invalid-date', value: 100 },
            { isMissing: false, observedAt: '2026-01-01T00:00:00.000Z', value: 100 },
            { isMissing: false, observedAt: '2026-01-02T00:00:00.000Z', value: null },
        ]);

        expect(normalized).toEqual([
            { timestamp: Date.parse('2026-01-01T00:00:00.000Z'), value: 100 },
            { timestamp: Date.parse('2026-01-03T00:00:00.000Z'), value: 300 },
        ]);
    });
});
