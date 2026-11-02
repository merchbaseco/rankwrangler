import { describe, expect, it } from 'bun:test';
import {
    classifyMerchListing,
    findUnmatchedMerchPackage,
} from '@/services/merch-listing-classification';
import { toPackageProfile } from '@/services/merch-package-profiles';
import { MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE } from '@/services/merch-template-bullets';

const inches = (value: number) => ({ value, unit: 'inches' });
const pounds = (value: number) => ({ value, unit: 'pounds' });
const standardTeePackage = toPackageProfile({
    dimensions: [inches(10), inches(8), inches(1)],
    weight: pounds(0.3),
});
const centimeterPackage = (dimensions: [number, number, number], kilograms: number) =>
    toPackageProfile({
        dimensions: [
            { value: dimensions[0], unit: 'centimeters' },
            { value: dimensions[1], unit: 'centimeters' },
            { value: dimensions[2], unit: 'centimeters' },
        ],
        weight: { value: kilograms, unit: 'kilograms' },
    });
const merchLeaf = {
    hasMerchListingAttributes: true,
    hasSellerListingAttributes: false,
    isVariationParent: false,
};
const sellerLeaf = {
    hasMerchListingAttributes: false,
    hasSellerListingAttributes: true,
    isVariationParent: false,
};

describe('classifyMerchListing', () => {
    it('classifies a Merch package with the Merch listing attributes', () => {
        // Awesome Christmas Family Co B07KVZMPNS carries seller attributes too.
        expect(
            classifyMerchListing({
                bullets: ['Officially Licensed by Peanuts', 'OPNT-0176'],
                hasProductIdentifier: false,
                packageProfile: standardTeePackage,
                catalogAttributes: { ...merchLeaf, hasSellerListingAttributes: true },
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Officially Licensed by Peanuts',
            bullet2: 'OPNT-0176',
        });
    });

    it('classifies a template bullet without package data', () => {
        expect(
            classifyMerchListing({
                bullets: [
                    'Funny cat dad design',
                    'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                ],
                hasProductIdentifier: false,
                packageProfile: null,
                catalogAttributes: null,
            })
        ).toEqual({ isMerchListing: true, bullet1: 'Funny cat dad design', bullet2: null });
    });

    it('classifies licensed Merch with a template bullet beside a UPC', () => {
        // Marvel B07KBLWCC1.
        expect(
            classifyMerchListing({
                bullets: [
                    'Marvel Avengers T-Shirt design. Officially Licensed Marvel Tee Shirt',
                    '18MARV00383A',
                    'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
                ],
                hasProductIdentifier: true,
                packageProfile: standardTeePackage,
                catalogAttributes: merchLeaf,
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Marvel Avengers T-Shirt design. Officially Licensed Marvel Tee Shirt',
            bullet2: '18MARV00383A',
        });
    });

    it('rejects a Merch package on a listing with a product identifier', () => {
        expect(
            classifyMerchListing({
                bullets: ['Seller bullet'],
                hasProductIdentifier: true,
                packageProfile: standardTeePackage,
                catalogAttributes: merchLeaf,
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });

    it('classifies older Merch whose bullets Amazon rewrote by its listing attributes', () => {
        // Star Wars B07KVKT3LY: no template bullet left and a remeasured package.
        expect(
            classifyMerchListing({
                bullets: [
                    'This officially licensed Star Wars apparel features the iconic X-Wing logo',
                    'Great gift for Star Wars enthusiasts and Return of the Jedi fans',
                ],
                hasProductIdentifier: false,
                packageProfile: centimeterPackage([2, 20.8, 21.3], 0.122),
                catalogAttributes: merchLeaf,
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'This officially licensed Star Wars apparel features the iconic X-Wing logo',
            bullet2: 'Great gift for Star Wars enthusiasts and Return of the Jedi fans',
        });
    });

    it('leaves a variation parent without a template or Merch package to its child', () => {
        expect(
            classifyMerchListing({
                bullets: [],
                hasProductIdentifier: false,
                packageProfile: null,
                catalogAttributes: { ...merchLeaf, isVariationParent: true },
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });

    it('rejects a vendor tee whose package matches Merch', () => {
        // Bioworld B09RSPKRYY: no manufacturer, part number or list price; a description.
        expect(
            classifyMerchListing({
                bullets: ['ROYAL BLUE: The royal blue background of this shirt'],
                hasProductIdentifier: false,
                packageProfile: toPackageProfile({
                    dimensions: [inches(1), inches(10), inches(10)],
                    weight: pounds(0.3),
                }),
                catalogAttributes: { ...sellerLeaf, isVariationParent: true },
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });

    it('needs catalog attributes to classify by package', () => {
        expect(
            classifyMerchListing({
                bullets: ['Officially Licensed by Peanuts'],
                hasProductIdentifier: false,
                packageProfile: standardTeePackage,
                catalogAttributes: null,
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });

    it('rejects a seller apparel listing with an arbitrary metric package', () => {
        // Haloumoning B0DPWKJW1D, part number M7Z659HW120.
        expect(
            classifyMerchListing({
                bullets: [
                    'Material:This short sleeve shirts for girls is made of high quality fabric',
                    'Design: Girls summer t-shirt, casual solid color tee tops',
                ],
                hasProductIdentifier: false,
                packageProfile: centimeterPackage([3.4036, 24.6126, 26.289], 0.29),
                catalogAttributes: sellerLeaf,
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });

    it('rejects a ruler that carries a UPC', () => {
        // Phinus B0GY8NVFHN, part number 16TXCZZN001.
        expect(
            classifyMerchListing({
                bullets: [
                    'Tshirt Ruler Set: You will receive 8 different size white t shirt rulers',
                ],
                hasProductIdentifier: true,
                packageProfile: centimeterPackage([1.7018, 15.1892, 26.0096], 0.231),
                catalogAttributes: { ...merchLeaf, hasSellerListingAttributes: true },
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });

    it('classifies pens by their template bullets', () => {
        expect(
            classifyMerchListing({
                bullets: [
                    'Character or Name design. This Jeffy merchandise is the perfect gift!',
                    '12-pack of 1.2mm retractable ballpoint pens featuring smooth-flowing ink',
                    'Ergonomic grip design for comfortable extended writing sessions',
                    'Pens use 97% Global Recycled Standard (GRS) materials',
                ],
                hasProductIdentifier: false,
                packageProfile: null,
                catalogAttributes: null,
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Character or Name design. This Jeffy merchandise is the perfect gift!',
            bullet2: null,
        });
    });

    it.each(
        Object.entries(MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE).flatMap(([productType, bullets]) =>
            bullets.map(bullet => [productType, bullet] as const)
        )
    )('recognizes the %s template bullet "%s"', (_productType, templateBullet) => {
        expect(
            classifyMerchListing({
                bullets: ['Seller bullet', templateBullet],
                hasProductIdentifier: false,
                packageProfile: null,
                catalogAttributes: null,
            })
        ).toEqual({ isMerchListing: true, bullet1: 'Seller bullet', bullet2: null });
    });

    it('keeps the first two seller bullets and normalizes template punctuation', () => {
        expect(
            classifyMerchListing({
                bullets: [
                    '  Dual-wall insulated stainless steel construction keeps beverages hot or cold, top rack dishwasher safe and BPA free  ',
                    '16” x 16” bag with two 14” long and 1” wide black cotton webbing strap handles.',
                    'Custom seller bullet one',
                    'Custom   seller bullet two',
                    'Custom seller bullet three',
                ],
                hasProductIdentifier: false,
                packageProfile: null,
                catalogAttributes: null,
            })
        ).toEqual({
            isMerchListing: true,
            bullet1: 'Custom seller bullet one',
            bullet2: 'Custom seller bullet two',
        });
    });

    it('does not treat generic seller copy as Merch', () => {
        expect(
            classifyMerchListing({
                bullets: ['Funny design.', 'Please see our size chart for the best fit'],
                hasProductIdentifier: false,
                packageProfile: null,
                catalogAttributes: null,
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });
});

describe('findUnmatchedMerchPackage', () => {
    it('reports a template-bullet listing whose package matches no profile', () => {
        const unknownPackage = toPackageProfile({
            dimensions: [inches(4), inches(4), inches(4)],
            weight: pounds(0.5),
        });
        const templateBullets = ['Lightweight, Classic fit, Double-needle sleeve and bottom hem'];

        expect(
            findUnmatchedMerchPackage({
                bullets: templateBullets,
                hasProductIdentifier: false,
                packageProfile: unknownPackage,
                catalogAttributes: null,
            })
        ).toEqual({ dimensionsInches: [4, 4, 4], weightPounds: 0.5 });
        expect(
            findUnmatchedMerchPackage({
                bullets: templateBullets,
                hasProductIdentifier: false,
                packageProfile: standardTeePackage,
                catalogAttributes: null,
            })
        ).toBeNull();
        expect(
            findUnmatchedMerchPackage({
                bullets: ['Seller bullet'],
                hasProductIdentifier: false,
                packageProfile: unknownPackage,
                catalogAttributes: null,
            })
        ).toBeNull();
    });
});
