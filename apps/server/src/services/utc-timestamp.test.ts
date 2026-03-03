import { describe, expect, it } from 'bun:test';
import { toUtcIsoTimestamp } from '@/services/utc-timestamp.js';

describe('toUtcIsoTimestamp', () => {
    it('returns null for nullish input', () => {
        expect(toUtcIsoTimestamp(null)).toBeNull();
        expect(toUtcIsoTimestamp('')).toBeNull();
    });

    it('treats timezone-less timestamps as UTC', () => {
        expect(toUtcIsoTimestamp('2026-03-03 21:04:42.123')).toBe('2026-03-03T21:04:42.123Z');
    });

    it('normalizes explicit offsets to UTC ISO', () => {
        expect(toUtcIsoTimestamp('2026-03-03 21:04:42+00')).toBe('2026-03-03T21:04:42.000Z');
        expect(toUtcIsoTimestamp('2026-03-03T13:04:42-08:00')).toBe('2026-03-03T21:04:42.000Z');
    });

    it('returns null for invalid values', () => {
        expect(toUtcIsoTimestamp('not-a-date')).toBeNull();
    });
});
