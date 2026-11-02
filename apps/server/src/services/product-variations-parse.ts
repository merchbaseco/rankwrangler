import { z } from 'zod';

export const VARIATION_ASIN_BATCH_SIZE = 20;

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

const AttributeEntrySchema = z
    .object({
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
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
        const value = firstMarketplaceValue(attributes[themeAttribute], marketplaceId);
        if (value !== null) {
            result[key] = value;
        }
    }
    return result;
};

export const assembleFamily = (
    parent: Extract<VariationRole, { kind: 'parent' }>,
    itemsByAsin: ReadonlyMap<string, unknown>,
    marketplaceId: string
): VariationFamily => {
    const children: VariationChild[] = [];
    for (const childAsin of parent.childAsins) {
        const item = itemsByAsin.get(childAsin);
        if (!item) {
            throw new Error(`Variation child ${childAsin} was missing from the catalog response.`);
        }
        children.push({
            asin: childAsin,
            attributes: readThemeAttributes(item, marketplaceId, parent.theme),
        });
    }
    return {
        parentAsin: parent.parentAsin,
        theme: parent.theme,
        children,
    };
};

export const familyMemberAsins = (
    parentAsin: string,
    children: readonly { asin: string }[]
): readonly string[] =>
    uniqueUpperAsins([parentAsin, ...children.map(child => child.asin)]);

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
            return attributes;
        }
        const theme = relationship.variationTheme?.theme?.trim();
        if (theme) {
            return theme
                .split('/')
                .map(part => part.trim())
                .filter(Boolean)
                .map(part => part.toLowerCase());
        }
    }
    return [];
};

const publicAttributeKey = (themeAttribute: string) => {
    const trimmed = themeAttribute.trim();
    const withoutNameSuffix = trimmed.replace(/_name$/i, '');
    return withoutNameSuffix.toLowerCase();
};

const firstMarketplaceValue = (
    entries: readonly z.infer<typeof AttributeEntrySchema>[] | null | undefined,
    marketplaceId: string
): string | null => {
    for (const entry of entries ?? []) {
        if (entry.marketplace_id && entry.marketplace_id !== marketplaceId) {
            continue;
        }
        if (entry.value === undefined || entry.value === null) {
            continue;
        }
        const value = String(entry.value).trim();
        if (value) {
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
