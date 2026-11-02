import { describe, expect, it } from 'bun:test';
import {
    assembleFamily,
    chunkAsins,
    readThemeAttributes,
    readVariationRole,
    VARIATION_ASIN_BATCH_SIZE,
} from './product-variations-parse';

const MARKETPLACE = 'ATVPDKIKX0DER';
const PARENT = 'B0GHTD7TKB';
const DEFAULT_CHILD = 'B0GHT1WYPY';

describe('product variations parse', () => {
    it('classifies a variation child with its parent ASIN', () => {
        const role = readVariationRole(childCatalogItem(DEFAULT_CHILD, PARENT), MARKETPLACE);
        expect(role).toEqual({ kind: 'child', parentAsin: PARENT });
    });

    it('preserves parent childAsins order and treats the first child as default', () => {
        const second = 'B0GHT00002';
        const role = readVariationRole(
            parentCatalogItem([DEFAULT_CHILD, second], ['color_name', 'size_name']),
            MARKETPLACE
        );
        expect(role).toMatchObject({
            kind: 'parent',
            parentAsin: PARENT,
            childAsins: [DEFAULT_CHILD, second],
        });
    });

    it('maps theme attributes to public keys', () => {
        const theme = ['color_name', 'size_name'];
        const attributes = readThemeAttributes(
            childCatalogItem(DEFAULT_CHILD, PARENT, {
                color_name: [{ value: 'Black', marketplace_id: MARKETPLACE }],
                size_name: [{ value: 'Large', marketplace_id: MARKETPLACE }],
            }),
            MARKETPLACE,
            theme
        );
        expect(attributes).toEqual({ color: 'Black', size: 'Large' });
    });

    it('chunks large families and assembles every child in catalog order', () => {
        const childAsins = [DEFAULT_CHILD, ...Array.from({ length: 39 }, (_, index) => childAsin(index + 2))];
        const parent = {
            kind: 'parent' as const,
            parentAsin: PARENT,
            theme: ['color_name'] as const,
            childAsins,
        };
        const chunks = chunkAsins(childAsins);
        expect(chunks).toHaveLength(2);
        expect(chunks[0]).toHaveLength(VARIATION_ASIN_BATCH_SIZE);
        expect(chunks[1]).toHaveLength(20);

        const itemsByAsin = new Map(
            childAsins.map((asin, index) => [
                asin,
                childCatalogItem(asin, PARENT, {
                    color_name: [{ value: `Color ${index + 1}`, marketplace_id: MARKETPLACE }],
                }),
            ])
        );
        const family = assembleFamily(parent, itemsByAsin, MARKETPLACE);
        expect(family.children.map(child => child.asin)).toEqual(childAsins);
        expect(family.children[0]?.asin).toBe(DEFAULT_CHILD);
        expect(family.children[0]?.attributes).toEqual({ color: 'Color 1' });
    });

    it('returns none for a standalone catalog item', () => {
        const role = readVariationRole(
            { asin: 'B0STANDALN', relationships: [] },
            MARKETPLACE
        );
        expect(role).toEqual({ kind: 'none' });
    });
});

const childAsin = (index: number) => `B0TEST${String(index).padStart(4, '0')}`;

const childCatalogItem = (
    asin: string,
    parentAsin: string,
    attributes: Record<string, Array<{ value: string; marketplace_id: string }>> = {}
) => ({
    asin,
    relationships: [
        {
            marketplaceId: MARKETPLACE,
            relationships: [{ type: 'VARIATION', parentAsins: [parentAsin] }],
        },
    ],
    attributes,
});

const parentCatalogItem = (childAsins: string[], themeAttributes: string[]) => ({
    asin: PARENT,
    relationships: [
        {
            marketplaceId: MARKETPLACE,
            relationships: [
                {
                    type: 'VARIATION',
                    childAsins,
                    variationTheme: { attributes: themeAttributes },
                },
            ],
        },
    ],
});
