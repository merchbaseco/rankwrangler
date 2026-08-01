import { describe, expect, it } from 'bun:test';
import { productUpdatedAt } from '@/api/app/recent-products.js';

describe('recentProducts pagination', () => {
    it('decodes computed update timestamps before building a cursor past the page limit', () => {
        const driverRows = Array.from({ length: 51 }, (_, index) => ({
            asin: `B${String(index).padStart(9, '0')}`,
            marketplaceId: 'ATVPDKIKX0DER',
            updatedAt: '2026-07-31 14:30:00.123',
        }));
        const rows = driverRows.map((row) => ({
            ...row,
            updatedAt: productUpdatedAt.decoder.mapFromDriverValue(row.updatedAt),
        }));
        const nextRow = rows.length > 50 ? rows[49] : null;

        expect(nextRow?.updatedAt.toISOString()).toBe('2026-07-31T14:30:00.123Z');
    });
});
