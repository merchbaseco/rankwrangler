import { describe, expect, it } from 'bun:test';
import { mapSpApiCatalogItem } from '@/services/spapi/catalog-product-mapper';

const US = 'ATVPDKIKX0DER';
const FETCHED_AT = '2026-10-28T12:00:00.000Z';

describe('mapSpApiCatalogItem Merch classification', () => {
    it('classifies a Merch part number when no bullet is a known template', () => {
        const mapped = mapSpApiCatalogItem(
            {
                asin: 'B0HJFG2PW9',
                attributes: {
                    part_number: [{ value: '28KSGP99PGP', marketplace_id: US }],
                    item_name: [{ value: 'Cute Mushroom Frog Premium T-Shirt', marketplace_id: US }],
                    bullet_point: [
                        { value: 'Cute mushroom frog design', marketplace_id: US },
                        { value: 'Great gift for cottagecore fans', marketplace_id: US },
                        { value: 'New premium tee template text', marketplace_id: US },
                    ],
                },
            },
            US,
            FETCHED_AT
        );

        expect(mapped).toMatchObject({
            isMerchListing: true,
            bullet1: 'Cute mushroom frog design',
            bullet2: 'Great gift for cottagecore fans',
        });
    });

    it('classifies other sellers from their part number and bullets as non-Merch', () => {
        const mapped = mapSpApiCatalogItem(
            {
                asin: 'B000123456',
                attributes: {
                    part_number: [{ value: 'GIL1100MDWHTP6-01-White-M', marketplace_id: US }],
                    bullet_point: [{ value: 'Multipack crew tee', marketplace_id: US }],
                },
            },
            US,
            FETCHED_AT
        );

        expect(mapped).toMatchObject({ isMerchListing: false, bullet1: null, bullet2: null });
    });

    it('classifies from the part number alone when bullets are missing', () => {
        const mapped = mapSpApiCatalogItem(
            {
                asin: 'B000123457',
                attributes: {
                    part_number: [{ value: 'G816D85AV0HB07535YF3H', marketplace_id: US }],
                    item_name: [{ value: 'Three Possum Moon Funny Meme T-Shirt', marketplace_id: US }],
                },
            },
            US,
            FETCHED_AT
        );

        expect(mapped).toMatchObject({ isMerchListing: true, bullet1: null, bullet2: null });
    });

    it('stays unknown without bullets or a part number', () => {
        const mapped = mapSpApiCatalogItem({ asin: 'B000123458', attributes: {} }, US, FETCHED_AT);

        expect(mapped).toMatchObject({ isMerchListing: null });
    });
});
