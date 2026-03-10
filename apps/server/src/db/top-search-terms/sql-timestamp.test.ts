import { describe, expect, it } from 'bun:test';
import { formatSqlTimestamp } from '@/db/top-search-terms/sql-timestamp.js';

describe('formatSqlTimestamp', () => {
    it('serializes dates as UTC timestamps without timezone markers', () => {
        const value = new Date('2026-03-10T17:35:13.123Z');

        expect(formatSqlTimestamp(value)).toBe('2026-03-10 17:35:13.123');
    });
});
