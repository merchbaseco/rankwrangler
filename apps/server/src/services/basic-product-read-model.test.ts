import { describe, expect, it, mock } from 'bun:test';
import { getBasicProductReadModels } from './basic-product-read-model';

describe('basic Product read model', () => {
    it('returns fixed-shape results and preserves known data for unavailable Products', async () => {
        const availableIdentity = {
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B000000001',
        };
        const unavailableIdentity = {
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B000000002',
        };
        const getProducts = mock(() =>
            Promise.resolve([
                {
                    identity: availableIdentity,
                    availability: 'available' as const,
                    product: {
                        title: 'Garden shirt',
                        isUnavailable: false,
                        thumbnail: {
                            status: 'available' as const,
                            url: 'https://example.com/garden.jpg',
                        },
                    },
                },
                {
                    identity: unavailableIdentity,
                    availability: 'available' as const,
                    product: {
                        title: 'Archived shirt',
                        isUnavailable: true,
                        thumbnail: {
                            status: 'available' as const,
                            url: 'https://example.com/archived.jpg',
                        },
                    },
                },
            ])
        );

        const result = await getBasicProductReadModels(
            { products: [availableIdentity, unavailableIdentity] },
            { getProducts } as never
        );

        expect(result).toEqual([
            {
                ...availableIdentity,
                title: 'Garden shirt',
                isUnavailable: false,
                thumbnail: {
                    status: 'available',
                    url: 'https://example.com/garden.jpg',
                },
            },
            {
                ...unavailableIdentity,
                title: 'Archived shirt',
                isUnavailable: true,
                thumbnail: {
                    status: 'available',
                    url: 'https://example.com/archived.jpg',
                },
            },
        ]);
        expect(getProducts).toHaveBeenCalledWith({
            products: [availableIdentity, unavailableIdentity],
            fetchPolicy: 'blocking',
            signal: undefined,
        });
    });

    it('uses null and an unavailable thumbnail when Amazon never returned listing data', async () => {
        const identity = {
            marketplaceId: 'ATVPDKIKX0DER',
            asin: 'B000000003',
        };
        const getProducts = mock(() =>
            Promise.resolve([
                {
                    identity,
                    availability: 'unavailable' as const,
                    product: null,
                },
            ])
        );

        const result = await getBasicProductReadModels(
            { products: [identity] },
            { getProducts } as never
        );

        expect(result).toEqual([
            {
                ...identity,
                title: null,
                thumbnail: { status: 'unavailable' },
                isUnavailable: true,
            },
        ]);
    });
});
