import { describe, expect, it } from 'bun:test';
import { formatDateTooltip } from './chart-utils';

describe('formatDateTooltip', () => {
    it('formats hovered point dates with month day and full year', () => {
        const timestamp = new Date(2026, 1, 24, 12, 0, 0).getTime();
        expect(formatDateTooltip(timestamp)).toBe('Feb 24, 2026');
    });
});
