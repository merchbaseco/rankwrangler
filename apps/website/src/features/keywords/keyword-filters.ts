import type { RouterInputs } from '@/lib/trpc';
import { isKeywordFacet, type KeywordFacet, type KeywordSort } from './keyword-model';

type DirectoryInput = RouterInputs['api']['app']['keywordDirectory'];
export type KeywordFacetsInput = RouterInputs['api']['app']['keyword']['directoryFacets'];
export type KeywordHeat = NonNullable<DirectoryInput['heat']>[number];
export type KeywordStage = NonNullable<DirectoryInput['stage']>[number];
export type KeywordFreshness = NonNullable<DirectoryInput['freshness']>[number];

/**
 * Everything that narrows and pages the Keywords grid, in the URL so a view
 * is linkable (`?q=…&heat=hot,warm&stage=trial&fresh=needsSync&shelf=has&sort=score&page=2`).
 * The grid opens on graduated keywords; `stage=all` shows every stage. `shelf`
 * and `merch` are has/none pairs: neither or both boxes mean any.
 */
export interface KeywordFilters {
    readonly q: string;
    readonly sort: KeywordSort;
    readonly heat: readonly KeywordHeat[];
    /** Empty means every stage. */
    readonly stage: readonly KeywordStage[];
    readonly freshness: readonly KeywordFreshness[];
    readonly shelf: 'any' | 'has' | 'none';
    readonly merch: 'any' | 'tracked' | 'none';
    readonly facet: KeywordFacet | null;
    readonly page: number;
    readonly pageSize: KeywordPageSize;
}

export const keywordHeats = ['hot', 'warm', 'cold'] as const satisfies readonly KeywordHeat[];
export const keywordStages = [
    'graduated',
    'trial',
    'dropped',
    'untracked',
] as const satisfies readonly KeywordStage[];

export const keywordStageLabels: Readonly<Record<KeywordStage, string>> = {
    dropped: 'Dropped',
    graduated: 'Graduated',
    trial: 'Trial',
    untracked: 'Untracked',
};

/** The stage the grid opens on, as the server's default work view does. */
export const defaultKeywordStages: readonly KeywordStage[] = ['graduated'];

export const keywordFreshnesses = [
    'live',
    'needsSync',
    'syncing',
] as const satisfies readonly KeywordFreshness[];

export const keywordFreshnessLabels: Readonly<Record<KeywordFreshness, string>> = {
    live: 'Live',
    needsSync: 'Needs sync',
    syncing: 'Syncing',
};

export const keywordSorts = [
    'score',
    'work',
    'newest',
    'medianBsr',
    'fresh',
    'merch',
] as const satisfies readonly KeywordSort[];

export const keywordSortLabels: Readonly<Record<KeywordSort, string>> = {
    fresh: 'Most new',
    medianBsr: 'Best shelf BSR',
    merch: 'Most Merch',
    newest: 'Newest',
    score: 'Score',
    work: 'Next to check',
};

export const keywordPageSizes = [25, 50, 100] as const;
export type KeywordPageSize = (typeof keywordPageSizes)[number];

export const parseKeywordFilters = (params: URLSearchParams): KeywordFilters => ({
    facet: isKeywordFacet(params.get('facet')) ? (params.get('facet') as KeywordFacet) : null,
    heat: list(params.get('heat'), keywordHeats),
    merch: pick(params.get('merch'), ['tracked', 'none'] as const, 'any'),
    page: Math.max(1, Math.floor(Number(params.get('page')) || 1)),
    pageSize: keywordPageSizes.find(size => String(size) === params.get('rows')) ?? 50,
    q: params.get('q') ?? '',
    shelf: pick(params.get('shelf'), ['has', 'none'] as const, 'any'),
    sort: pick(params.get('sort'), keywordSorts, 'score'),
    stage: parseStages(params.get('stage')),
    freshness: list(params.get('fresh'), keywordFreshnesses),
});

/** Writes a patch onto URL params; anything but a page turn returns to page 1. */
export const writeKeywordFilters = (
    params: URLSearchParams,
    patch: Partial<KeywordFilters>
): URLSearchParams => {
    const next = new URLSearchParams(params);
    const set = (key: string, value: string | null) => {
        if (value) {
            next.set(key, value);
        } else {
            next.delete(key);
        }
    };
    if ('q' in patch) {
        set('q', patch.q?.trim() ? (patch.q ?? null) : null);
    }
    if ('sort' in patch) {
        set('sort', patch.sort === 'score' ? null : (patch.sort ?? null));
    }
    if ('heat' in patch) {
        set('heat', patch.heat?.join(',') || null);
    }
    if ('stage' in patch) {
        set('stage', writeStages(patch.stage ?? defaultKeywordStages));
    }
    if ('freshness' in patch) {
        set('fresh', patch.freshness?.join(',') || null);
    }
    if ('shelf' in patch) {
        set('shelf', patch.shelf === 'any' ? null : (patch.shelf ?? null));
    }
    if ('merch' in patch) {
        set('merch', patch.merch === 'any' ? null : (patch.merch ?? null));
    }
    if ('facet' in patch) {
        set('facet', patch.facet ?? null);
    }
    if ('pageSize' in patch) {
        set('rows', patch.pageSize === 50 ? null : String(patch.pageSize ?? ''));
    }
    set('page', 'page' in patch && patch.page !== 1 ? String(patch.page ?? '') : null);
    return next;
};

/** The filter half of the directory reads, shared by the grid and its facets. */
export const keywordFacetsInput = (
    filters: Pick<
        KeywordFilters,
        'facet' | 'freshness' | 'heat' | 'merch' | 'q' | 'shelf' | 'stage'
    >
): KeywordFacetsInput => ({
    facet: filters.facet ?? undefined,
    freshness: [...filters.freshness],
    heat: [...filters.heat],
    merch: filters.merch === 'any' ? undefined : filters.merch,
    search: filters.q.trim() || undefined,
    shelfElite: filters.shelf === 'any' ? undefined : filters.shelf,
    stage: [...filters.stage],
});

/** One grid page: the shared filters plus sort and offset paging. */
export const keywordDirectoryInput = (filters: KeywordFilters): DirectoryInput => ({
    ...keywordFacetsInput(filters),
    page: filters.page,
    pageSize: filters.pageSize,
    sort: filters.sort,
});

/** Whether anything but sort and paging narrows the grid. */
export const isKeywordFiltered = (filters: KeywordFilters) =>
    filters.q.trim() !== '' ||
    filters.heat.length > 0 ||
    !isDefaultStages(filters.stage) ||
    filters.freshness.length > 0 ||
    filters.shelf !== 'any' ||
    filters.merch !== 'any' ||
    filters.facet !== null;

export const clearedKeywordFilters: Partial<KeywordFilters> = {
    facet: null,
    heat: [],
    merch: 'any',
    q: '',
    shelf: 'any',
    stage: defaultKeywordStages,
    freshness: [],
};

/** Whether the stages are the grid's opening view (graduated only). */
export const isDefaultStages = (stages: readonly KeywordStage[]) =>
    stages.length === defaultKeywordStages.length &&
    defaultKeywordStages.every(stage => stages.includes(stage));

const pick = <T extends string, F extends string>(
    value: string | null,
    options: readonly T[],
    fallback: F
): T | F => ((options as readonly string[]).includes(value ?? '') ? (value as T) : fallback);

const list = <T extends string>(value: string | null, options: readonly T[]): T[] => {
    const chosen = new Set((value ?? '').split(','));
    return options.filter(option => chosen.has(option));
};

/** No `stage` param is the default view; `all` is every stage. */
const parseStages = (value: string | null): readonly KeywordStage[] => {
    if (value === null) {
        return defaultKeywordStages;
    }
    return value === 'all' ? [] : list(value, keywordStages);
};

const writeStages = (stages: readonly KeywordStage[]) => {
    if (isDefaultStages(stages)) {
        return null;
    }
    return stages.length ? keywordStages.filter(stage => stages.includes(stage)).join(',') : 'all';
};
