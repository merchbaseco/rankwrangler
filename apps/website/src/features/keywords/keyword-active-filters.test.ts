import { describe, expect, test } from 'bun:test';
import { keywordActiveFilters, withoutKeywordFilters } from './keyword-active-filters';
import { parseKeywordFilters } from './keyword-filters';

describe('keyword active filters', () => {
    test('nothing narrowing means no tags', () => {
        expect(keywordActiveFilters(parseKeywordFilters(new URLSearchParams()))).toEqual([]);
    });

    test('each narrowing filter becomes a tag and removes cleanly', () => {
        const filters = parseKeywordFilters(
            new URLSearchParams('q=boo&heat=hot,warm&stage=trial&fresh=needsSync&shelf=has')
        );
        expect(keywordActiveFilters(filters).map(filter => filter.label)).toEqual([
            '“boo”',
            'Hot',
            'Warm',
            'Trial',
            'Needs sync',
            'Has an Elite seller',
        ]);
        expect(withoutKeywordFilters(filters, ['heat:hot', 'shelf'])).toEqual({
            heat: ['warm'],
            shelf: 'any',
        });
        expect(withoutKeywordFilters(filters, ['stage:trial'])).toEqual({ stage: ['graduated'] });
    });

    test('every stage reads as one tag', () => {
        const filters = parseKeywordFilters(new URLSearchParams('stage=all'));
        expect(filters.stage).toEqual([]);
        expect(keywordActiveFilters(filters).map(filter => filter.label)).toEqual(['All stages']);
    });
});
