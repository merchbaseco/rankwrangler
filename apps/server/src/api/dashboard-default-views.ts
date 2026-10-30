/**
 * The inputs the dashboard sends for its default Explore and Keywords views, which the server
 * warms after a restart. The website's `dashboard-default-views.test.ts` keeps them in step.
 */
export const defaultExploreFilters = {
    brands: [],
    facets: [],
    isMerchListing: true,
    niche: 'any',
    published: 'any',
    tiers: [],
} as const;

export const defaultExplorePage = {
    ...defaultExploreFilters,
    page: 1,
    pageSize: 50,
    recordInterest: false,
    sort: 'salesRankAsc',
} as const;

export const defaultKeywordFilters = { freshness: [], heat: [], stage: ['graduated'] } as const;

export const defaultKeywordPage = {
    ...defaultKeywordFilters,
    page: 1,
    pageSize: 50,
    sort: 'score',
} as const;
