import { describe, expect, it } from 'bun:test';
import { classifyMerchListing } from '@/services/merch-listing-classification';
import { MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE } from '@/services/merch-template-bullets';

// Part numbers observed on production US listings (Merch designs vs. other sellers).
const MERCH_PART_NUMBERS = [
    'J1CRFA43350',
    'JWY5GR47076',
    'AFCHRPAT1KY',
    '28KSGP99PGP',
    'YBQAYMK17BV',
    'GZN5MYMASBT',
    '006BFTSGZZ9',
    'G816D85AV0HB07535YF3H',
    'JFZEFS3E8HGB0B5B25JP7',
    'CMEJRJTXDD2B0752XJYNL',
];

const NON_MERCH_PART_NUMBERS = [
    // Structured 11-character codes from books, DVDs and branded goods that matched the bare shape.
    'YES33194325',
    'YES20562489',
    'PARD345624D',
    'PPAX1364775',
    '83344X08001',
    'GIL1100MDWHTP6-01-White-M',
    'GIL1100-036-2XL',
    '105484',
    '9781607749707',
    '7506306230507',
    'Top7',
    '1566-04P-L',
    'FUN97311IN',
    'JCFJI47S-999',
    'NEP-CITYG-XL',
    'TWUS02TS002P2-M',
    'Sesiwadbe',
    'Corgi Mug',
    '12345678901',
    'afchrpat1ky',
    'AFCHRPAT1KYX9',
];

const noBullets = { kind: 'available', bullets: [] } as const;

describe('classifyMerchListing', () => {
    it('returns no classification without bullets or a part number', () => {
        expect(
            classifyMerchListing({ bullets: { kind: 'unavailable' }, partNumber: null })
        ).toBeNull();
        expect(
            classifyMerchListing({ bullets: { kind: 'unavailable' }, partNumber: '  ' })
        ).toBeNull();
    });

    it('classifies available empty evidence as known non-Merch', () => {
        expect(classifyMerchListing({ bullets: noBullets, partNumber: null })).toEqual({
            isMerchListing: false,
            bullet1: null,
            bullet2: null,
        });
    });

    it.each(MERCH_PART_NUMBERS)('recognizes Merch part number %s', partNumber => {
        expect(
            classifyMerchListing({
                bullets: { kind: 'unavailable' },
                partNumber,
                title: 'Funny Cat Lover Graphic T-Shirt',
            })
        ).toMatchObject({ isMerchListing: true });
    });

    it.each(NON_MERCH_PART_NUMBERS)('rejects non-Merch part number %s', partNumber => {
        expect(
            classifyMerchListing({ bullets: { kind: 'unavailable' }, partNumber })
        ).toMatchObject({ isMerchListing: false });
    });

    it.each([
        ['ULGS322B01S', 'ULGS322B01S', 'SONGMICS Dresser for Bedroom, Wide Dresser with 5 Fabric Drawers'],
        ['FG3H8900WHT', '2060338', 'Rubbermaid Configurations Deluxe Closet Kit, White'],
        ['MINGLUO0121', null, 'Lilaly White Sewing Buttons, 100 pcs, 5 Sizes Round Buttons'],
    ])('rejects a fitting part number %s with a model number or no Merch product', (partNumber, modelNumber, title) => {
        expect(
            classifyMerchListing({ bullets: noBullets, partNumber, modelNumber, title })
        ).toMatchObject({ isMerchListing: false });
    });

    it('requires a Merch product in the title for a part-number match', () => {
        const evidence = { bullets: noBullets, partNumber: 'AFCHRPAT1KY' };
        expect(classifyMerchListing({ ...evidence, title: 'Mele Kalikimaka Sweatshirt' })).toMatchObject(
            { isMerchListing: true }
        );
        expect(classifyMerchListing({ ...evidence, title: null })).toMatchObject({
            isMerchListing: false,
        });
    });

    it('keeps seller bullets for part-number Merch listings without template bullets', () => {
        expect(
            classifyMerchListing({
                bullets: {
                    kind: 'available',
                    bullets: ['Breast cancer awareness horror tee', 'Pink ribbon slasher gift'],
                },
                partNumber: 'AFCHRPAT1KY',
                title: 'In October We Wear Pink Breast Cancer Awareness Horror T-Shirt',
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Breast cancer awareness horror tee',
            bullet2: 'Pink ribbon slasher gift',
        });
    });

    it.each(
        Object.entries(MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE).flatMap(([productType, bullets]) =>
            bullets.map(bullet => [productType, bullet] as const)
        )
    )('recognizes the %s template bullet "%s"', (_productType, templateBullet) => {
        expect(
            classifyMerchListing({
                bullets: { kind: 'available', bullets: ['Seller bullet', templateBullet] },
                partNumber: 'Top7',
            })
        ).toEqual({ isMerchListing: true, bullet1: 'Seller bullet', bullet2: null });
    });

    it('matches templates and keeps the first two seller bullets', () => {
        expect(
            classifyMerchListing({
                bullets: {
                    kind: 'available',
                    bullets: [
                        'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                        'Custom seller bullet one',
                        'Custom seller bullet two',
                        'Custom seller bullet three',
                    ],
                },
                partNumber: null,
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Custom seller bullet one',
            bullet2: 'Custom seller bullet two',
        });
    });

    it('normalizes punctuation and whitespace for template matching', () => {
        expect(
            classifyMerchListing({
                bullets: {
                    kind: 'available',
                    bullets: [
                        '  Dual-wall insulated stainless steel construction keeps beverages hot or cold, top rack dishwasher safe and BPA free  ',
                        '16” x 16” bag with two 14” long and 1” wide black cotton webbing strap handles.',
                        'Seller bullet',
                    ],
                },
                partNumber: null,
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Seller bullet',
            bullet2: null,
        });
    });

    it('does not treat generic seller copy or Merch-style titles as Merch', () => {
        expect(
            classifyMerchListing({
                bullets: {
                    kind: 'available',
                    bullets: [
                        'Funny design.',
                        'Please be advised to see our size chart for the best fit',
                        'Premium T-Shirt',
                    ],
                },
                partNumber: 'LQ-3699-BK-M',
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });
});
