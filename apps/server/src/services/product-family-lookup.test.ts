import { describe, expect, it, mock } from 'bun:test';
import { familyIdentityKey } from '@/db/product/product-family';
import {
    lookupProductFamilies,
    type ProductFamilyLookupDeps,
} from './product-family-lookup';

const MARKETPLACE = 'ATVPDKIKX0DER';
const PARENT = 'B0FAMPARENT';
const CHILD = 'B0FAMSMALL1';
const LARGE = 'B0FAMLARGE1';
const UNKNOWN = 'B0FAMUNKN01';
const FAMILY_ID = '11111111-1111-4111-8111-111111111111';

describe('lookupProductFamilies', () => {
    it('resolves a parent ASIN to its stored family and variants', async () => {
        const deps = createDeps({
            resolve: new Map([
                [familyIdentityKey({ marketplaceId: MARKETPLACE, asin: PARENT }), {
                    marketplaceId: MARKETPLACE,
                    asin: PARENT,
                }],
            ]),
            families: [
                {
                    id: FAMILY_ID,
                    asin: PARENT,
                    variationsCheckedAt: new Date('2026-10-01T00:00:00.000Z'),
                },
            ],
            aliases: [
                { productId: FAMILY_ID, asin: LARGE },
                { productId: FAMILY_ID, asin: CHILD },
            ],
        });

        const [result] = await lookupProductFamilies(
            { marketplaceId: MARKETPLACE, asins: [PARENT] },
            deps
        );

        expect(result).toEqual({
            status: 'known',
            marketplaceId: MARKETPLACE,
            requestedAsin: PARENT,
            familyAsin: PARENT,
            variationsCheckedAt: '2026-10-01T00:00:00.000Z',
            variants: [
                {
                    asin: LARGE,
                    attributes: { size: null, color: null, fit: null, style: null },
                },
                {
                    asin: CHILD,
                    attributes: { size: null, color: null, fit: null, style: null },
                },
            ],
        });
        expect(deps.enqueueUnknownAsins).not.toHaveBeenCalled();
    });

    it('resolves a child ASIN through aliases to the family parent', async () => {
        const deps = createDeps({
            resolve: new Map([
                [familyIdentityKey({ marketplaceId: MARKETPLACE, asin: CHILD }), {
                    marketplaceId: MARKETPLACE,
                    asin: PARENT,
                }],
            ]),
            families: [
                {
                    id: FAMILY_ID,
                    asin: PARENT,
                    variationsCheckedAt: new Date('2026-09-15T12:00:00.000Z'),
                },
            ],
            aliases: [
                { productId: FAMILY_ID, asin: CHILD },
                { productId: FAMILY_ID, asin: LARGE },
            ],
        });

        const [result] = await lookupProductFamilies({ asins: [CHILD] }, deps);

        expect(result).toMatchObject({
            status: 'known',
            requestedAsin: CHILD,
            familyAsin: PARENT,
            variationsCheckedAt: '2026-09-15T12:00:00.000Z',
        });
        expect(result.status === 'known' && result.variants.map(variant => variant.asin)).toEqual([
            LARGE,
            CHILD,
        ]);
    });

    it('returns unknown and enqueues discovery for ASINs with no stored family', async () => {
        const deps = createDeps({
            resolve: new Map([
                [familyIdentityKey({ marketplaceId: MARKETPLACE, asin: UNKNOWN }), {
                    marketplaceId: MARKETPLACE,
                    asin: UNKNOWN,
                }],
            ]),
            families: [],
            aliases: [],
        });

        const [result] = await lookupProductFamilies({ asins: [UNKNOWN] }, deps);

        expect(result).toEqual({
            status: 'unknown',
            marketplaceId: MARKETPLACE,
            requestedAsin: UNKNOWN,
        });
        expect(deps.enqueueUnknownAsins).toHaveBeenCalledWith([
            { marketplaceId: MARKETPLACE, asin: UNKNOWN },
        ]);
    });

    it('keeps unknown status when enqueue fails', async () => {
        const deps = createDeps({
            resolve: new Map([
                [familyIdentityKey({ marketplaceId: MARKETPLACE, asin: UNKNOWN }), {
                    marketplaceId: MARKETPLACE,
                    asin: UNKNOWN,
                }],
            ]),
            families: [],
            aliases: [],
            enqueue: mock(async () => {
                throw new Error('queue offline');
            }),
        });

        const results = await lookupProductFamilies({ asins: [UNKNOWN] }, deps);

        expect(results).toEqual([
            { status: 'unknown', marketplaceId: MARKETPLACE, requestedAsin: UNKNOWN },
        ]);
    });
});

const createDeps = (input: {
    resolve: Map<string, { marketplaceId: string; asin: string }>;
    families: { id: string; asin: string; variationsCheckedAt: Date | null }[];
    aliases: { productId: string; asin: string }[];
    enqueue?: ProductFamilyLookupDeps['enqueueUnknownAsins'];
}): ProductFamilyLookupDeps => ({
    resolveFamilyIdentities: mock(async (_database, identities) => {
        const resolved = new Map(
            identities.map(identity => [
                familyIdentityKey(identity),
                input.resolve.get(familyIdentityKey(identity)) ?? identity,
            ])
        );
        return resolved;
    }),
    loadFamilies: mock(async () => input.families),
    loadAliases: mock(async () => input.aliases),
    enqueueUnknownAsins: input.enqueue ?? mock(async () => input.aliases.length),
});
