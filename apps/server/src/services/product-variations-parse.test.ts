import { describe, expect, it } from 'bun:test';
import {
    assembleFamily,
    chunkAsins,
    publicAttributeKey,
    readThemeAttributes,
    readVariationRole,
    truncateChildAsins,
    VARIATION_ASIN_BATCH_SIZE,
    VARIATIONS_MAX_CHILDREN,
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
            parentCatalogItem([DEFAULT_CHILD, second], ['color', 'size']),
            MARKETPLACE
        );
        expect(role).toMatchObject({
            kind: 'parent',
            parentAsin: PARENT,
            childAsins: [DEFAULT_CHILD, second],
            theme: ['color', 'size'],
        });
    });

    it('maps SIZE_NAME/COLOR_NAME/FIT_TYPE theme fallbacks to public keys', () => {
        expect(publicAttributeKey('SIZE_NAME')).toBe('size');
        expect(publicAttributeKey('COLOR_NAME')).toBe('color');
        expect(publicAttributeKey('FIT_TYPE')).toBe('fit');
        expect(publicAttributeKey('DEPARTMENT_NAME')).toBe('department');

        const role = readVariationRole(
            {
                asin: PARENT,
                relationships: [
                    {
                        marketplaceId: MARKETPLACE,
                        relationships: [
                            {
                                type: 'VARIATION',
                                childAsins: [DEFAULT_CHILD],
                                variationTheme: { theme: 'COLOR_NAME/SIZE_NAME/FIT_TYPE' },
                            },
                        ],
                    },
                ],
            },
            MARKETPLACE
        );
        expect(role).toMatchObject({
            kind: 'parent',
            theme: ['color', 'size', 'fit'],
        });
    });

    it('reads Merch apparel color, size, and fit from Catalog 2022-04-01 attributes', () => {
        const theme = ['color', 'size', 'fit'];
        const attributes = readThemeAttributes(
            childCatalogItem(DEFAULT_CHILD, PARENT, {
                color: [{ value: 'Navy', marketplace_id: MARKETPLACE }],
                size: [{ value: 'Large', marketplace_id: MARKETPLACE }],
                fit_type: [{ value: 'Mens', marketplace_id: MARKETPLACE }],
                department: [{ value: 'mens', marketplace_id: MARKETPLACE }],
            }),
            MARKETPLACE,
            theme
        );
        expect(attributes).toEqual({ color: 'Navy', size: 'Large', fit: 'Mens' });
    });

    it('keeps catalog-missing children with empty attributes without throwing', () => {
        const missing = 'B0MISSING01';
        const present = DEFAULT_CHILD;
        const parent = {
            kind: 'parent' as const,
            parentAsin: PARENT,
            theme: ['color', 'size'] as const,
            childAsins: [present, missing],
        };
        const family = assembleFamily(
            parent,
            new Map([
                [
                    present,
                    childCatalogItem(present, PARENT, {
                        color: [{ value: 'Black', marketplace_id: MARKETPLACE }],
                        size: [{ value: 'M', marketplace_id: MARKETPLACE }],
                    }),
                ],
            ]),
            MARKETPLACE
        );
        expect(family.children).toEqual([
            { asin: present, attributes: { color: 'Black', size: 'M' } },
            { asin: missing, attributes: {} },
        ]);
        expect(family.children[0]?.asin).toBe(present);
    });

    it('chunks large families and truncates at the child cap', () => {
        const childAsins = [
            DEFAULT_CHILD,
            ...Array.from({ length: 39 }, (_, index) => childAsin(index + 2)),
        ];
        const chunks = chunkAsins(childAsins);
        expect(chunks).toHaveLength(2);
        expect(chunks[0]).toHaveLength(VARIATION_ASIN_BATCH_SIZE);
        expect(chunks[1]).toHaveLength(20);

        const oversized = Array.from({ length: VARIATIONS_MAX_CHILDREN + 25 }, (_, index) =>
            childAsin(index + 1)
        );
        const truncated = truncateChildAsins(oversized);
        expect(truncated.childAsins).toHaveLength(VARIATIONS_MAX_CHILDREN);
        expect(truncated.truncated).toBe(25);
    });

    it('returns none for a standalone catalog item', () => {
        const role = readVariationRole({ asin: 'B0STANDALN', relationships: [] }, MARKETPLACE);
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
