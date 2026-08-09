import { describe, expect, it, mock } from 'bun:test';
import { getBasicProductReadModels } from './basic-product-read-model';

describe('basic Product read model', () => {
    it('returns compact available and unavailable outcomes in request order', async () => {
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
                        thumbnail: {
                            status: 'available' as const,
                            url: 'https://example.com/garden.jpg',
                        },
                    },
                },
                {
                    identity: unavailableIdentity,
                    availability: 'unavailable' as const,
                    product: null,
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
                status: 'available',
                title: 'Garden shirt',
                thumbnail: {
                    status: 'available',
                    url: 'https://example.com/garden.jpg',
                },
            },
            { ...unavailableIdentity, status: 'unavailable' },
        ]);
        expect(getProducts).toHaveBeenCalledWith({
            products: [availableIdentity, unavailableIdentity],
            fetchPolicy: 'blocking',
            signal: undefined,
        });
    });
});
