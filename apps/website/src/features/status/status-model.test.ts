import { describe, expect, it } from 'bun:test';
import { formatRelative, fraction, operationLabel, systemTone } from './status-model';

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const at = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();

describe('formatRelative', () => {
    it('reads past and future instants in minutes, hours, then days', () => {
        expect(formatRelative(at(-12), NOW)).toBe('12m ago');
        expect(formatRelative(at(180), NOW)).toBe('in 3h');
        expect(formatRelative(at(-3 * 1440), NOW)).toBe('3d ago');
        expect(formatRelative(at(0), NOW)).toBe('now');
        expect(formatRelative(null, NOW)).toBe('—');
    });
});

describe('fraction', () => {
    it('clamps to the whole and treats an unknown whole as empty', () => {
        expect(fraction(50, 200)).toBe(0.25);
        expect(fraction(300, 200)).toBe(1);
        expect(fraction(5, null)).toBe(0);
        expect(fraction(5, 0)).toBe(0);
    });
});

describe('operationLabel', () => {
    it('drops the provider prefix and reads as a sentence', () => {
        expect(operationLabel('spapi.catalog.search')).toBe('Catalog search');
        expect(operationLabel('keepa.product')).toBe('Product');
        expect(operationLabel('plain')).toBe('plain');
    });
});

describe('systemTone', () => {
    it('is ok only while every health check passes', () => {
        const status = (health: { status: 'ok' } | { status: 'degraded'; failing: string[] }) =>
            ({ health }) as Parameters<typeof systemTone>[0];
        expect(systemTone(undefined)).toBe('unknown');
        expect(systemTone(status({ status: 'ok' }))).toBe('ok');
        expect(systemTone(status({ failing: ['keepa-history'], status: 'degraded' }))).toBe(
            'attention'
        );
    });
});
