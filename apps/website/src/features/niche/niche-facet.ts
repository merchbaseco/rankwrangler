import {
    BirthdayCakeIcon,
    Briefcase01Icon,
    CatIcon,
    GiftIcon,
    Globe02Icon,
    HeartIcon,
    Location01Icon,
    MaskTheater01Icon,
    PartyIcon,
    PuzzleIcon,
    Restaurant01Icon,
    RibbonIcon,
    Tag01Icon,
    UserIcon,
} from '@hugeicons-pro/core-stroke-rounded';

type IconGlyph = typeof Tag01Icon;

const wordSeparator = /[-_\s]+/u;

export interface NicheFacet {
    /** Facet category, e.g. `hobby`. */
    readonly facet: string;
    /** Facet value slug, e.g. `bass-fishing`. */
    readonly name: string;
}

/**
 * Display metadata for product facet categories (the niche a design serves).
 * One icon per category so a niche chip reads at a glance; unknown categories
 * fall back to a tag.
 */
const categories: Readonly<Record<string, { label: string; icon: IconGlyph }>> = {
    animal: { icon: CatIcon, label: 'Animal' },
    cause: { icon: RibbonIcon, label: 'Cause' },
    culture: { icon: MaskTheater01Icon, label: 'Culture' },
    food: { icon: Restaurant01Icon, label: 'Food' },
    hobby: { icon: PuzzleIcon, label: 'Hobby' },
    holiday: { icon: GiftIcon, label: 'Holiday' },
    identity: { icon: UserIcon, label: 'Identity' },
    occasion: { icon: BirthdayCakeIcon, label: 'Occasion' },
    'party-theme': { icon: PartyIcon, label: 'Party Theme' },
    place: { icon: Location01Icon, label: 'Place' },
    profession: { icon: Briefcase01Icon, label: 'Profession' },
    relationship: { icon: HeartIcon, label: 'Relationship' },
    subject: { icon: Globe02Icon, label: 'Subject' },
};

/** The icon for a facet category. */
export const nicheFacetIcon = (facet: string): IconGlyph => categories[facet]?.icon ?? Tag01Icon;

/** `Profession`, or the raw category title-cased. */
export const nicheCategoryLabel = (facet: string): string =>
    categories[facet]?.label ?? titleCase(facet);

/** `Bass Fishing` from `bass-fishing`. */
export const nicheValueLabel = (name: string): string => titleCase(name);

/** Stable key for a facet pair, `hobby:bass-fishing`. */
export const nicheFacetKey = (facet: NicheFacet): string => `${facet.facet}:${facet.name}`;

/** Parses a `nicheFacetKey`; null when malformed. */
export const parseNicheFacetKey = (key: string): NicheFacet | null => {
    const separator = key.indexOf(':');
    if (separator <= 0 || separator === key.length - 1) {
        return null;
    }
    return { facet: key.slice(0, separator), name: key.slice(separator + 1) };
};

const titleCase = (value: string) =>
    value
        .split(wordSeparator)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
