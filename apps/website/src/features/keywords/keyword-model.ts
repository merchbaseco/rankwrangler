import type { RouterInputs, RouterOutputs } from '@/lib/trpc';

export type KeywordRow = RouterOutputs['api']['app']['keywordDirectory']['items'][number];

type DirectoryInput = RouterInputs['api']['app']['keywordDirectory'];

export type KeywordSort = NonNullable<DirectoryInput['sort']>;

export type KeywordFacet = NonNullable<DirectoryInput['facet']>;

/** A table row with its 1-based position in the current ordering. */
export interface RankedKeywordRow extends KeywordRow {
    readonly position: number;
}

/**
 * Facet categories the directory can filter by (the server's product facet
 * keys), in the mock's order, with plural chip labels.
 */
export const keywordFacetFilters: readonly { facet: KeywordFacet; label: string }[] = [
    { facet: 'hobby', label: 'Hobbies' },
    { facet: 'profession', label: 'Professions' },
    { facet: 'animal', label: 'Animals' },
    { facet: 'holiday', label: 'Holidays' },
    { facet: 'identity', label: 'Identity' },
    { facet: 'food', label: 'Food' },
    { facet: 'place', label: 'Places' },
    { facet: 'cause', label: 'Causes' },
    { facet: 'occasion', label: 'Occasions' },
    { facet: 'culture', label: 'Culture' },
    { facet: 'party-theme', label: 'Party Themes' },
];

export const isKeywordFacet = (key: unknown): key is KeywordFacet =>
    keywordFacetFilters.some(filter => filter.facet === key);

/** Popularity tiers from the standing score, coloured with the nearest BSR tier ink. */
export const heatDisplay = {
    cold: { label: 'Cold', tier: 'slow' },
    hot: { label: 'Hot', tier: 'hot' },
    warm: { label: 'Warm', tier: 'strong' },
} as const;

export type RatedHeat = keyof typeof heatDisplay;

export const isRatedHeat = (heat: string): heat is RatedHeat => heat in heatDisplay;

/** Why a keyword is not collected, shown under its stage. */
export const idleStageNotes = {
    dropped: 'Not enough Merch on page 1',
    untracked: 'Not scheduled',
} as const satisfies Partial<Record<KeywordRow['stage'], string>>;

/** Tracking a keyword we do not collect records interest, which schedules it again. */
export const isTrackable = (row: Pick<KeywordRow, 'stage'>) =>
    row.stage === 'dropped' || row.stage === 'untracked';

/** `12m ago`, `3h ago`, `2d ago`, or null when unknown. */
export const formatAgo = (iso: string | null, now = Date.now()): string | null => {
    if (!iso) {
        return null;
    }
    const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
    if (Number.isNaN(seconds)) {
        return null;
    }
    if (seconds < 60) {
        return 'just now';
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

/** The normalized form the directory stores terms in, for an exact-match check. */
export const normalizeTerm = (term: string) => term.trim().toLowerCase().replace(whitespace, ' ');

const whitespace = /\s+/gu;
