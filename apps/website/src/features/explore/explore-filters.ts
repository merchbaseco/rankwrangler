import { type BsrTier, bsrTiers } from '@/features/bsr/bsr-tier';

/**
 * Everything that narrows and pages the Explore grid, as it lives in the URL
 * so a view is linkable:
 * `?q=fishing&tier=elite,hot&published=last60d&nicheState=has&brand=…&price=under20&listing=all&sort=newest&page=2&rows=100`.
 * `niche` is one niche facet (`hobby:fishing`, from a row's menu) on top of
 * the sidebar's has/none choice. `listing` narrows by Merch classification
 * and opens on Merch. Defaults are omitted from the URL.
 */
export interface ExploreFilters {
    readonly q: string;
    readonly tiers: ReadonlySet<BsrTier>;
    readonly published: PublishedWindow;
    readonly nicheState: NicheState;
    /** A `nicheFacetKey`, e.g. `hobby:fishing`. */
    readonly niche: string | null;
    readonly brand: string | null;
    readonly price: PriceBand;
    readonly listing: ListingType;
    readonly sort: ExploreSort;
    readonly page: number;
    readonly pageSize: PageSize;
}

export const publishedWindows = ['last60d', 'lastYear', 'any'] as const;
export type PublishedWindow = (typeof publishedWindows)[number];

export const publishedWindowLabels: Readonly<Record<PublishedWindow, string>> = {
    any: 'Any time',
    last60d: 'Last 60 days',
    lastYear: 'Last year',
};

export const nicheStates = ['any', 'has', 'none'] as const;
export type NicheState = (typeof nicheStates)[number];

export const priceBands = ['any', 'under15', '15to20', '20to25', 'over25'] as const;
export type PriceBand = (typeof priceBands)[number];

export const priceBandLabels: Readonly<Record<PriceBand, string>> = {
    '15to20': '$15 – $20',
    '20to25': '$20 – $25',
    any: 'Any price',
    over25: 'Over $25',
    under15: 'Under $15',
};

/** Each band as the search's `price` range, in cents (inclusive). */
export const priceBandRanges: Readonly<
    Record<Exclude<PriceBand, 'any'>, { readonly min?: number; readonly max?: number }>
> = {
    '15to20': { max: 1999, min: 1500 },
    '20to25': { max: 2499, min: 2000 },
    over25: { min: 2500 },
    under15: { max: 1499 },
};

export const listingTypes = ['merch', 'all', 'notMerch', 'unknown'] as const;
export type ListingType = (typeof listingTypes)[number];

export const listingTypeLabels: Readonly<Record<ListingType, string>> = {
    all: 'All listings',
    merch: 'Merch',
    notMerch: 'Not Merch',
    unknown: 'Unknown',
};

/** Each listing type as the search's `isMerchListing` filter. */
export const listingTypeInputs = {
    all: 'all',
    merch: true,
    notMerch: false,
    unknown: 'unknown',
} as const satisfies Record<ListingType, boolean | 'all' | 'unknown'>;

export const exploreSorts = ['bsr', 'newest', 'sold', 'updated'] as const;
export type ExploreSort = (typeof exploreSorts)[number];

export const exploreSortLabels: Readonly<Record<ExploreSort, string>> = {
    bsr: 'Best BSR',
    newest: 'Newest',
    sold: 'Most sold',
    updated: 'Recently updated',
};

export const exploreSortInputs = {
    bsr: 'salesRankAsc',
    newest: 'firstAvailableAtDesc',
    sold: 'monthlySoldDesc',
    updated: 'updatedAtDesc',
} as const satisfies Record<ExploreSort, string>;

export const pageSizes = [25, 50, 100] as const;
export type PageSize = (typeof pageSizes)[number];

export const defaultExploreFilters: ExploreFilters = {
    brand: null,
    listing: 'merch',
    niche: null,
    nicheState: 'any',
    page: 1,
    pageSize: 50,
    price: 'any',
    published: 'any',
    q: '',
    sort: 'bsr',
    tiers: new Set(),
};

export const parseExploreFilters = (params: URLSearchParams): ExploreFilters => ({
    brand: params.get('brand') || null,
    listing: pick(params.get('listing'), listingTypes, 'merch'),
    niche: params.get('niche') || null,
    nicheState: pick(params.get('nicheState'), nicheStates, 'any'),
    page: Math.max(1, Math.floor(Number(params.get('page')) || 1)),
    pageSize: pickSize(params.get('rows')),
    price: pick(params.get('price'), priceBands, 'any'),
    published: pick(params.get('published'), publishedWindows, 'any'),
    q: params.get('q') ?? '',
    sort: pick(params.get('sort'), exploreSorts, 'bsr'),
    tiers: new Set(
        (params.get('tier') ?? '')
            .split(',')
            .filter((value): value is BsrTier => (bsrTiers as readonly string[]).includes(value))
    ),
});

/**
 * Writes a patch onto URL params, dropping keys that return to their default.
 * Any change but a page turn returns to page 1, so a narrower result never
 * strands the grid past its last page.
 */
export const writeExploreFilters = (
    params: URLSearchParams,
    patch: Partial<ExploreFilters>
): URLSearchParams => {
    const next = new URLSearchParams(params);
    const set = (key: string, value: string | null) => {
        if (value) {
            next.set(key, value);
        } else {
            next.delete(key);
        }
    };
    const orDefault = <T>(value: T | undefined, fallback: T) =>
        value === fallback || value === undefined ? null : String(value);
    if ('q' in patch) {
        set('q', patch.q?.trim() ? (patch.q ?? null) : null);
    }
    if ('brand' in patch) {
        set('brand', patch.brand?.trim() || null);
    }
    if ('niche' in patch) {
        set('niche', patch.niche ?? null);
    }
    if ('nicheState' in patch) {
        set('nicheState', orDefault(patch.nicheState, 'any'));
    }
    if ('listing' in patch) {
        set('listing', orDefault(patch.listing, 'merch'));
    }
    if ('price' in patch) {
        set('price', orDefault(patch.price, 'any'));
    }
    if ('published' in patch) {
        set('published', orDefault(patch.published, 'any'));
    }
    if ('sort' in patch) {
        set('sort', orDefault(patch.sort, 'bsr'));
    }
    if ('pageSize' in patch) {
        set('rows', orDefault(patch.pageSize, 50));
    }
    if ('tiers' in patch) {
        set('tier', bsrTiers.filter(tier => patch.tiers?.has(tier)).join(',') || null);
    }
    set('page', 'page' in patch ? orDefault(patch.page, 1) : null);
    return next;
};

/** Whether anything but sort and paging narrows the grid. */
export const isExploreFiltered = (filters: ExploreFilters) =>
    filters.q.trim() !== '' ||
    filters.tiers.size > 0 ||
    filters.niche !== null ||
    filters.nicheState !== 'any' ||
    filters.brand !== null ||
    filters.price !== 'any' ||
    filters.listing !== 'merch' ||
    filters.published !== 'any';

/** The patch that clears every narrowing filter (sort and page size stay). */
export const clearedExploreFilters: Partial<ExploreFilters> = {
    brand: null,
    listing: 'merch',
    niche: null,
    nicheState: 'any',
    price: 'any',
    published: 'any',
    q: '',
    tiers: new Set(),
};

const pick = <T extends string>(value: string | null, options: readonly T[], fallback: T): T =>
    (options as readonly string[]).includes(value ?? '') ? (value as T) : fallback;

const pickSize = (value: string | null): PageSize =>
    pageSizes.find(size => String(size) === value) ?? 50;
