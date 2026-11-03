import { z } from 'zod';
import {
    catalogEntryDisplayString,
    catalogKeysForPublicAttribute,
    displayStringForPublicAttribute,
    publicAttributeKey,
    uniquePublicThemeKeys,
} from './product-variations-theme';

export const VARIATION_ASIN_BATCH_SIZE = 20;
export const VARIATIONS_MAX_CHILDREN = 1000;
export { publicAttributeKey } from './product-variations-theme';

export interface VariationChild {
    readonly asin: string;
    readonly attributes: Readonly<Record<string, string>>;
}

export interface VariationFamily {
    readonly parentAsin: string;
    readonly theme: readonly string[];
    readonly children: readonly VariationChild[];
}

export type VariationRole =
    | { readonly kind: 'none' }
    | { readonly kind: 'child'; readonly parentAsin: string }
    | {
          readonly kind: 'parent';
          readonly parentAsin: string;
          readonly theme: readonly string[];
          readonly childAsins: readonly string[];
      };

/** Apparel sizes use object entries (`size` / nested `value`); keep entries permissive. */
const AttributeEntrySchema = z
    .object({
        marketplace_id: z.string().optional(),
    })
    .passthrough();

const VariationThemeSchema = z
    .object({
        attributes: z.array(z.string()).optional(),
        theme: z.string().optional(),
    })
    .passthrough();

const RelationshipSchema = z
    .object({
        type: z.string(),
        parentAsins: z.array(z.string()).optional(),
        childAsins: z.array(z.string()).optional(),
        variationTheme: VariationThemeSchema.optional(),
    })
    .passthrough();

const CatalogItemSchema = z
    .object({
        asin: z.string(),
        relationships: z
            .array(
                z
                    .object({
                        marketplaceId: z.string(),
                        relationships: z.array(RelationshipSchema).optional(),
                    })
                    .passthrough()
            )
            .optional(),
        attributes: z.record(z.string(), z.array(AttributeEntrySchema).nullable()).optional(),
    })
    .passthrough();

const CatalogSearchSchema = z
    .object({
        items: z.array(z.unknown()).optional(),
    })
    .passthrough();

/** Boundary parse of one Catalog Items search payload. Does not use ItemSchema (it strips theme attrs). */
export const parseCatalogItems = (payload: unknown): readonly unknown[] => {
    const parsed = CatalogSearchSchema.safeParse(payload);
    return parsed.success ? (parsed.data.items ?? []) : [];
};

export const readVariationRole = (item: unknown, marketplaceId: string): VariationRole => {
    const parsed = CatalogItemSchema.safeParse(item);
    if (!parsed.success) {
        return { kind: 'none' };
    }
    const asin = parsed.data.asin.toUpperCase();
    const variations = (
        parsed.data.relationships?.find(entry => entry.marketplaceId === marketplaceId)
            ?.relationships ?? []
    ).filter(relationship => relationship.type === 'VARIATION');

    const parentAsin = firstDistinctAsin(
        variations.flatMap(relationship => relationship.parentAsins ?? []),
        asin
    );
    const childAsins = uniqueUpperAsins(
        variations.flatMap(relationship => relationship.childAsins ?? [])
    );
    if (parentAsin) {
        return { kind: 'child', parentAsin };
    }
    if (childAsins.length === 0) {
        return { kind: 'none' };
    }
    return {
        kind: 'parent',
        parentAsin: asin,
        theme: readThemeNames(variations),
        childAsins,
    };
};

export const readThemeAttributes = (
    item: unknown,
    marketplaceId: string,
    theme: readonly string[]
): Readonly<Record<string, string>> => {
    const parsed = CatalogItemSchema.safeParse(item);
    if (!parsed.success || theme.length === 0) {
        return {};
    }
    const attributes = parsed.data.attributes ?? {};
    const result: Record<string, string> = {};
    for (const themeAttribute of theme) {
        const key = publicAttributeKey(themeAttribute);
        const value = firstAttributeValue(attributes, marketplaceId, key);
        if (value !== null) {
            result[key] = value;
        }
    }
    return result;
};

/**
 * Children follow Amazon's childAsins order. A child absent from the catalog response (suppressed
 * or retired) is kept with empty attributes so defaultChildAsin stays Amazon's first entry.
 */
export const assembleFamily = (
    parent: Extract<VariationRole, { kind: 'parent' }>,
    itemsByAsin: ReadonlyMap<string, unknown>,
    marketplaceId: string
): VariationFamily => {
    const children: VariationChild[] = [];
    for (const childAsin of parent.childAsins) {
        const item = itemsByAsin.get(childAsin);
        children.push({
            asin: childAsin,
            attributes: item ? readThemeAttributes(item, marketplaceId, parent.theme) : {},
        });
    }
    return {
        parentAsin: parent.parentAsin,
        theme: parent.theme,
        children,
    };
};

/** Theme keys that resolved on zero children (attribute missing or unreadable). */
export const unresolvedThemeKeys = (family: VariationFamily): readonly string[] =>
    family.theme.filter(key =>
        family.children.every(child => child.attributes[key] === undefined)
    );

/** Sorted Catalog attribute key names on a raw item (values omitted for diagnostics). */
export const catalogAttributeKeyNames = (item: unknown): readonly string[] => {
    const parsed = CatalogItemSchema.safeParse(item);
    if (!parsed.success || !parsed.data.attributes) {
        return [];
    }
    return Object.keys(parsed.data.attributes).sort((left, right) => left.localeCompare(right));
};

export const truncateChildAsins = (
    childAsins: readonly string[],
    maxChildren: number = VARIATIONS_MAX_CHILDREN
): { readonly childAsins: readonly string[]; readonly truncated: number } => {
    if (childAsins.length <= maxChildren) {
        return { childAsins, truncated: 0 };
    }
    return {
        childAsins: childAsins.slice(0, maxChildren),
        truncated: childAsins.length - maxChildren,
    };
};

export const familyMemberAsins = (
    parentAsin: string,
    children: readonly { asin: string }[]
): readonly string[] => uniqueUpperAsins([parentAsin, ...children.map(child => child.asin)]);

export const chunkAsins = (
    asins: readonly string[],
    size: number = VARIATION_ASIN_BATCH_SIZE
): readonly (readonly string[])[] => {
    if (size <= 0) {
        throw new Error('ASIN batch size must be positive.');
    }
    const chunks: string[][] = [];
    for (let index = 0; index < asins.length; index += size) {
        chunks.push([...asins.slice(index, index + size)]);
    }
    return chunks;
};

const readThemeNames = (
    variations: readonly z.infer<typeof RelationshipSchema>[]
): readonly string[] => {
    for (const relationship of variations) {
        const attributes = relationship.variationTheme?.attributes
            ?.map(name => name.trim())
            .filter(Boolean);
        if (attributes && attributes.length > 0) {
            return uniquePublicThemeKeys(attributes);
        }
        const theme = relationship.variationTheme?.theme?.trim();
        if (theme) {
            return uniquePublicThemeKeys(
                theme
                    .split('/')
                    .map(part => part.trim())
                    .filter(Boolean)
            );
        }
    }
    return [];
};

const firstAttributeValue = (
    attributes: Readonly<Record<string, readonly z.infer<typeof AttributeEntrySchema>[] | null>>,
    marketplaceId: string,
    publicKey: string
): string | null => {
    for (const alias of catalogKeysForPublicAttribute(publicKey)) {
        const value = firstMarketplaceValue(attributes[alias], marketplaceId);
        if (value !== null) {
            return displayStringForPublicAttribute(publicKey, value);
        }
    }
    return null;
};

const firstMarketplaceValue = (
    entries: readonly z.infer<typeof AttributeEntrySchema>[] | null | undefined,
    marketplaceId: string
): string | null => {
    for (const entry of entries ?? []) {
        if (entry.marketplace_id && entry.marketplace_id !== marketplaceId) {
            continue;
        }
        const value = catalogEntryDisplayString(entry);
        if (value !== null) {
            return value;
        }
    }
    return null;
};

const firstDistinctAsin = (asins: readonly string[], self: string): string | null => {
    for (const asin of asins) {
        const upper = asin.toUpperCase();
        if (upper && upper !== self) {
            return upper;
        }
    }
    return null;
};

const uniqueUpperAsins = (asins: readonly string[]): readonly string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const asin of asins) {
        const upper = asin.toUpperCase();
        if (!upper || seen.has(upper)) {
            continue;
        }
        seen.add(upper);
        result.push(upper);
    }
    return result;
};
