import { describe, expect, it } from 'bun:test';
import { eventRangeStart } from './event-range';
import {
    formatPercent,
    fraction,
    operationLabel,
    providerVerdict,
    type SystemStatus,
    spApiOperationUsage,
    systemTone,
} from './status-model';

describe('fraction', () => {
    it('clamps to the whole and treats an unknown whole as empty', () => {
        expect(fraction(50, 200)).toBe(0.25);
        expect(fraction(300, 200)).toBe(1);
        expect(fraction(5, null)).toBe(0);
        expect(fraction(5, 0)).toBe(0);
    });
});

describe('formatPercent', () => {
    it('keeps a decimal for small rates and never rounds a real one to zero', () => {
        expect(formatPercent(0)).toBe('0%');
        expect(formatPercent(0.0004)).toBe('<0.1%');
        expect(formatPercent(0.012)).toBe('1.2%');
        expect(formatPercent(0.456)).toBe('46%');
    });
});

describe('operationLabel', () => {
    it('names report calls plainly and reads the rest as a sentence', () => {
        expect(operationLabel('spapi.catalog.search')).toBe('Catalog search');
        expect(operationLabel('spapi.reports.get')).toBe('Report polls');
        expect(operationLabel('keepa.product')).toBe('Product');
        expect(operationLabel('plain')).toBe('plain');
    });
});

describe('systemTone', () => {
    it('is ok only while every health check passes', () => {
        expect(systemTone(undefined)).toBe('unknown');
        expect(systemTone(status({ health: { status: 'ok' } }))).toBe('ok');
        expect(systemTone(status({ health: { failing: ['keepa'], status: 'degraded' } }))).toBe(
            'attention'
        );
    });
});

describe('providerVerdict', () => {
    it('judges throttles and other errors apart, against their own lines', () => {
        expect(providerVerdict(status({ calls: [call({ calls24h: 1000 })] }), 'spapi')).toBe(
            'healthy'
        );
        const verdict = (counts: Partial<SystemStatus['calls'][number]>) =>
            providerVerdict(status({ calls: [call({ calls24h: 1000, ...counts })] }), 'spapi');
        expect(verdict({ throttled24h: 5 })).toBe('healthy');
        expect(verdict({ throttled24h: 20 })).toBe('throttled');
        expect(verdict({ errors24h: 60 })).toBe('failing');
    });
    it('calls an unreachable provider unreachable, whatever its calls say', () => {
        const down = status({
            calls: [call({ calls24h: 1000 })],
            health: { failing: ['spapi'], status: 'degraded' },
        });
        expect(providerVerdict(down, 'spapi')).toBe('unreachable');
        expect(providerVerdict(down, 'keepa')).toBe('healthy');
    });
});

describe('spApiOperationUsage', () => {
    it('lists every limited operation, idle or not, then unlimited ones that made calls', () => {
        const usage = spApiOperationUsage(
            status({
                calls: [
                    call({ calls1h: 120, operation: 'spapi.catalog.search' }),
                    call({ calls1h: 3, operation: 'spapi.reports.download' }),
                    call({ calls1h: 0, operation: 'spapi.unused' }),
                ],
                spApiLimits: [
                    { hourlyLimit: 7200, operation: 'spapi.catalog.search' },
                    { hourlyLimit: 60, operation: 'spapi.reports.create' },
                ],
            })
        );
        expect(usage).toEqual([
            {
                calls1h: 120,
                hourlyLimit: 7200,
                label: 'Catalog search',
                operation: 'spapi.catalog.search',
            },
            {
                calls1h: 0,
                hourlyLimit: 60,
                label: 'Report requests',
                operation: 'spapi.reports.create',
            },
            {
                calls1h: 3,
                hourlyLimit: null,
                label: 'Report downloads',
                operation: 'spapi.reports.download',
            },
        ]);
    });
});

describe('eventRangeStart', () => {
    it('ends with the bucket holding now, as the server lays buckets out', () => {
        const now = Date.parse('2026-10-29T12:07:30.000Z');
        expect(eventRangeStart('1h', now)).toBe('2026-10-29T11:08:00.000Z');
        expect(eventRangeStart('24h', now)).toBe('2026-10-28T12:30:00.000Z');
    });
});

const status = (overrides: Partial<SystemStatus>) =>
    ({ calls: [], health: { status: 'ok' }, spApiLimits: [], ...overrides }) as SystemStatus;

const call = (overrides: Partial<SystemStatus['calls'][number]>) => ({
    calls1h: 0,
    calls24h: 0,
    errors24h: 0,
    operation: 'spapi.catalog.search',
    provider: 'spapi',
    throttled24h: 0,
    ...overrides,
});
