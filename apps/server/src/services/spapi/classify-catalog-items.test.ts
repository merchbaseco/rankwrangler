import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { classifyCatalogItems } from '@/services/spapi/classify-catalog-items';
import type { CatalogItem } from '@/services/spapi/search-catalog-items-schema';

const US = 'ATVPDKIKX0DER';
const CROQUET_BULLETS = [
    "Croquet queen design Crack open the chardonnay, and let's play some croquet.",
    'Funny croquet gift for a croquet club, croquet champion, or croquet team.',
];

// Joy Haus tumbler family: the parent carries only seller bullets, the variant the Merch stamps.
const croquetParent = (overrides: Partial<CatalogItem> = {}): CatalogItem => ({
    asin: 'B0DHL1MRZ3',
    identifiers: [{ marketplaceId: US, identifiers: [] }],
    summaries: [{ marketplaceId: US, itemClassification: 'VARIATION_PARENT' }],
    relationships: [
        {
            marketplaceId: US,
            relationships: [{ type: 'VARIATION', childAsins: ['B0DHKV5N9T', 'B0DHKRJ6W3'] }],
        },
    ],
    attributes: { bullet_point: CROQUET_BULLETS.map(value => ({ value, marketplace_id: US })) },
    ...overrides,
});

const croquetTumbler: CatalogItem = {
    asin: 'B0DHKV5N9T',
    identifiers: [{ marketplaceId: US, identifiers: [] }],
    summaries: [{ marketplaceId: US, itemClassification: 'BASE_PRODUCT' }],
    attributes: {
        bullet_point: [
            ...CROQUET_BULLETS,
            'Dual wall insulated: keeps beverages hot or cold',
            'Stainless Steel, BPA Free',
        ].map(value => ({ value, marketplace_id: US })),
        item_package_dimensions: [
            {
                length: { unit: 'inches', value: 3.7 },
                width: { unit: 'inches', value: 3.78 },
                height: { unit: 'inches', value: 7.28 },
                marketplace_id: US,
            },
        ],
        item_package_weight: [{ unit: 'pounds', value: 0.723, marketplace_id: US }],
    },
};

const providerReturning = (items: unknown[]) => {
    const requests: unknown[] = [];
    return {
        requests,
        provider: {
            searchCatalogItemsByAsins: (input: {
                asins: string[];
                marketplaceId: string;
                priority?: 'foreground' | 'background';
            }) => {
                requests.push(input);
                return Promise.resolve({ items });
            },
        },
    };
};

describe('classifyCatalogItems', () => {
    let warn: ReturnType<typeof spyOn> | null = null;
    afterEach(() => {
        warn?.mockRestore();
        warn = null;
    });

    it("gives an evidence-less parent its first child's verdict and seller bullets", async () => {
        const { provider, requests } = providerReturning([croquetTumbler]);
        const [result] = await classifyCatalogItems({
            items: [croquetParent()],
            marketplaceId: US,
            priority: 'background',
            provider,
        });

        expect(result.merch).toEqual({
            isMerchListing: true,
            bullet1: CROQUET_BULLETS[0],
            bullet2: CROQUET_BULLETS[1],
        });
        expect(requests).toEqual([
            { asins: ['B0DHKV5N9T'], marketplaceId: US, priority: 'background' },
        ]);
    });

    it('reuses a child already on the page instead of fetching it', async () => {
        const { provider, requests } = providerReturning([]);
        const results = await classifyCatalogItems({
            items: [croquetParent(), croquetTumbler],
            marketplaceId: US,
            provider,
        });

        expect(results.map(({ item, merch }) => [item.asin, merch.isMerchListing])).toEqual([
            ['B0DHL1MRZ3', true],
            ['B0DHKV5N9T', true],
        ]);
        expect(requests).toEqual([]);
    });

    it('keeps the parent non-Merch when the child is not returned', async () => {
        const { provider, requests } = providerReturning([]);
        const [result] = await classifyCatalogItems({
            items: [croquetParent()],
            marketplaceId: US,
            provider,
        });

        expect(result.merch).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
        expect(requests).toHaveLength(1);
    });

    it('does not consult a child for a parent with a description or an identifier', async () => {
        const { provider, requests } = providerReturning([croquetTumbler]);
        const results = await classifyCatalogItems({
            items: [
                croquetParent({
                    attributes: {
                        bullet_point: [{ value: CROQUET_BULLETS[0], marketplace_id: US }],
                        product_description: [{ marketplace_id: US }],
                    },
                }),
                croquetParent({
                    asin: 'B0CJ2NDCT3',
                    identifiers: [{ marketplaceId: US, identifiers: [{ identifierType: 'UPC' }] }],
                }),
            ],
            marketplaceId: US,
            provider,
        });

        expect(results.map(({ merch }) => merch.isMerchListing)).toEqual([false, false]);
        expect(requests).toEqual([]);
    });

    it('fetches missing children at most 20 per request', async () => {
        const { provider, requests } = providerReturning([]);
        const parents = Array.from({ length: 21 }, (_, index) =>
            croquetParent({
                asin: `B0PARENT${String(index).padStart(2, '0')}`,
                relationships: [
                    {
                        marketplaceId: US,
                        relationships: [
                            {
                                type: 'VARIATION',
                                childAsins: [`B0CHILD0${String(index).padStart(2, '0')}`],
                            },
                        ],
                    },
                ],
            })
        );
        await classifyCatalogItems({ items: parents, marketplaceId: US, provider });

        expect(requests.map(request => (request as { asins: string[] }).asins.length)).toEqual([
            20, 1,
        ]);
    });

    it('rejects a variant that carries an external product identifier', async () => {
        const { provider } = providerReturning([]);
        const [result] = await classifyCatalogItems({
            items: [
                {
                    ...croquetTumbler,
                    attributes: {
                        ...croquetTumbler.attributes,
                        externally_assigned_product_identifier: [{ marketplace_id: US }],
                    },
                },
            ],
            marketplaceId: US,
            provider,
        });

        expect(result.merch.isMerchListing).toBe(false);
    });

    it('warns when a Merch template bullet ships in a package no profile matches', async () => {
        warn = spyOn(console, 'warn').mockImplementation(() => undefined);
        const { provider } = providerReturning([]);
        await classifyCatalogItems({
            items: [
                {
                    ...croquetTumbler,
                    attributes: {
                        ...croquetTumbler.attributes,
                        item_package_weight: [{ unit: 'pounds', value: 0.9, marketplace_id: US }],
                    },
                },
            ],
            marketplaceId: US,
            provider,
        });

        expect(warn.mock.calls).toEqual([
            [
                '[Merch Classification] B0DHKV5N9T has a Merch template bullet but an unknown ' +
                    'package profile 3.7 x 3.78 x 7.28 in, 0.9 lb',
            ],
        ]);
    });
});
