import { describe, expect, it } from 'bun:test';
import type {
    KnownProductFamilyLookup,
    ProductFamilyLookupEntry,
    ProductFamilyVariant,
    UnknownProductFamilyLookup,
} from '@/services/product-family-lookup';

/**
 * MerchBase Core and its agents consume `api.public.product.family` /
 * MCP `operation=family` to resolve any ASIN to its listing family. Keep this
 * shape stable; a failure here is a cross-service break.
 */
type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
        ? true
        : false;
type Assert<Condition extends true> = Condition;

export type MerchBaseFamilyKnownKeysContract = Assert<
    Equal<
        keyof KnownProductFamilyLookup,
        | 'status'
        | 'marketplaceId'
        | 'requestedAsin'
        | 'familyAsin'
        | 'variationsCheckedAt'
        | 'variants'
    >
>;
export type MerchBaseFamilyUnknownKeysContract = Assert<
    Equal<keyof UnknownProductFamilyLookup, 'status' | 'marketplaceId' | 'requestedAsin'>
>;
export type MerchBaseFamilyVariantKeysContract = Assert<
    Equal<keyof ProductFamilyVariant, 'asin' | 'attributes'>
>;
export type MerchBaseFamilyAttributeKeysContract = Assert<
    Equal<keyof ProductFamilyVariant['attributes'], 'size' | 'color' | 'fit' | 'style'>
>;
export type MerchBaseFamilyStatusContract = Assert<
    Equal<ProductFamilyLookupEntry['status'], 'known' | 'unknown'>
>;

const knownKeys = [
    'status',
    'marketplaceId',
    'requestedAsin',
    'familyAsin',
    'variationsCheckedAt',
    'variants',
] as const;

const unknownKeys = ['status', 'marketplaceId', 'requestedAsin'] as const;

const variantKeys = ['asin', 'attributes'] as const;

const attributeKeys = ['size', 'color', 'fit', 'style'] as const;

describe('MerchBase product.family contract', () => {
    it('pins the known and unknown response shapes', () => {
        const known = {
            status: 'known',
            marketplaceId: 'ATVPDKIKX0DER',
            requestedAsin: 'B0CHILD000',
            familyAsin: 'B0PARENT00',
            variationsCheckedAt: '2026-10-01T00:00:00.000Z',
            variants: [
                {
                    asin: 'B0CHILD000',
                    attributes: { size: null, color: null, fit: null, style: null },
                },
            ],
        } satisfies KnownProductFamilyLookup;

        const unknown = {
            status: 'unknown',
            marketplaceId: 'ATVPDKIKX0DER',
            requestedAsin: 'B0UNKNOWN0',
        } satisfies UnknownProductFamilyLookup;

        expect(Object.keys(known).sort()).toEqual([...knownKeys].sort());
        expect(Object.keys(unknown).sort()).toEqual([...unknownKeys].sort());
        expect(Object.keys(known.variants[0]!).sort()).toEqual([...variantKeys].sort());
        expect(Object.keys(known.variants[0]!.attributes).sort()).toEqual([...attributeKeys].sort());
        expect(unknown).not.toHaveProperty('familyAsin');
        expect(unknown).not.toHaveProperty('variants');
        expect(unknown).not.toHaveProperty('variationsCheckedAt');
    });
});
