import { describe, expect, test } from 'bun:test';
import { exploreActiveFilters, withoutExploreFilters } from './explore-active-filters';
import { defaultExploreFilters } from './explore-filters';

describe('explore active filters', () => {
    test('nothing narrowing means no tags', () => {
        expect(exploreActiveFilters(defaultExploreFilters)).toEqual([]);
    });

    test('each narrowing filter becomes a tag, in sidebar order', () => {
        const filters = {
            ...defaultExploreFilters,
            brand: 'Copper Canyon Tees',
            published: 'last60d' as const,
            q: 'halloween',
            tiers: new Set(['hot', 'elite'] as const),
        };
        expect(exploreActiveFilters(filters).map(filter => filter.label)).toEqual([
            '“halloween”',
            'Elite',
            'Hot',
            'Last 60 days',
            'Brand: Copper Canyon Tees',
        ]);
    });

    test('removing tags patches only what they name', () => {
        const filters = {
            ...defaultExploreFilters,
            q: 'x',
            tiers: new Set(['hot', 'elite'] as const),
        };
        const patch = withoutExploreFilters(filters, ['tier:hot', 'q']);
        expect([...(patch.tiers ?? [])]).toEqual(['elite']);
        expect(patch.q).toBe('');
        expect(patch.brand).toBeUndefined();
    });
});
