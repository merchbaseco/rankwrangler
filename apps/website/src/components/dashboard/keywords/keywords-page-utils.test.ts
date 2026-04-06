import { describe, expect, it } from 'bun:test';
import { resolveSelectedSearchTerm } from '@/components/dashboard/keywords/keywords-page-utils';

describe('resolveSelectedSearchTerm', () => {
    it('does not auto-select the first row when nothing is selected', () => {
        const resolved = resolveSelectedSearchTerm({
            rows: [{ searchTerm: 'easter' }, { searchTerm: 'easter gifts' }],
            selectedSearchTerm: null,
        });

        expect(resolved).toBeNull();
    });

    it('preserves the existing selection when it is still present', () => {
        const resolved = resolveSelectedSearchTerm({
            rows: [{ searchTerm: 'easter' }, { searchTerm: 'easter gifts' }],
            selectedSearchTerm: 'easter gifts',
        });

        expect(resolved).toBe('easter gifts');
    });

    it('clears the selection when filters remove the selected term', () => {
        const resolved = resolveSelectedSearchTerm({
            rows: [{ searchTerm: 'easter' }],
            selectedSearchTerm: 'easter gifts',
        });

        expect(resolved).toBeNull();
    });
});
