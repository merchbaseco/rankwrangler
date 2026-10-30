import { describe, expect, it } from 'bun:test';
import {
    defaultExploreFilters,
    defaultExplorePage,
    defaultKeywordFilters,
    defaultKeywordPage,
} from '@/api/dashboard-default-views';
import {
    appKeywordDirectoryInput,
    keywordDirectoryFacetsInput,
} from '@/api/keyword-directory-input';
import { appProductSearchInput, productSearchFacetsInput } from '@/api/product-search-input';
import { parseExploreFilters } from '@/features/explore/explore-filters';
import { exploreFacetsInput, exploreSearchInput } from '@/features/explore/explore-search-input';
import {
    keywordDirectoryInput,
    keywordFacetsInput,
    parseKeywordFilters,
} from '@/features/keywords/keyword-filters';

// The server warms its caches with these inputs after a restart; a mismatch wastes the warm-up.
describe('dashboard default views', () => {
    const explore = parseExploreFilters(new URLSearchParams());
    const keywords = parseKeywordFilters(new URLSearchParams());
    const same = <T>(schema: { parse: (value: unknown) => T }, sent: unknown, warmed: unknown) =>
        expect(JSON.stringify(schema.parse(sent))).toBe(JSON.stringify(schema.parse(warmed)));

    it('matches what the default Explore view sends', () => {
        same(productSearchFacetsInput, exploreFacetsInput(explore), defaultExploreFilters);
        same(appProductSearchInput, exploreSearchInput(explore), defaultExplorePage);
    });

    it('matches what the default Keywords view sends', () => {
        same(keywordDirectoryFacetsInput, keywordFacetsInput(keywords), defaultKeywordFilters);
        same(appKeywordDirectoryInput, keywordDirectoryInput(keywords), defaultKeywordPage);
    });
});
