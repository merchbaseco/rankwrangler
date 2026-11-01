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

describe('classifyMerchListing', () => {
    it('classifies a tee by its Merch package when no bullet is a template', () => {
        expect(
            classifyMerchListing({
                bullets: ['Officially Licensed by Peanuts', 'OPNT-0176'],
                hasProductIdentifier: false,
                packageProfile: standardTeePackage,
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
            })
        ).toEqual({ isMerchListing: true, bullet1: 'Funny cat dad design', bullet2: null });
    });

    it('never classifies a listing with a product identifier', () => {
        expect(
            classifyMerchListing({
                bullets: ['Lightweight, Classic fit, Double-needle sleeve and bottom hem'],
                hasProductIdentifier: true,
                packageProfile: standardTeePackage,
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
                packageProfile: toPackageProfile({
                    dimensions: [
                        { value: 3.4036, unit: 'centimeters' },
                        { value: 24.6126, unit: 'centimeters' },
                        { value: 26.289, unit: 'centimeters' },
                    ],
                    weight: { value: 0.29, unit: 'kilograms' },
                }),
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
                packageProfile: toPackageProfile({
                    dimensions: [
                        { value: 1.7018, unit: 'centimeters' },
                        { value: 15.1892, unit: 'centimeters' },
                        { value: 26.0096, unit: 'centimeters' },
                    ],
                    weight: { value: 0.231, unit: 'kilograms' },
                }),
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
            })
        ).toEqual({ isMerchListing: false, bullet1: null, bullet2: null });
    });
});

describe('Merch package profiles', () => {
    it('converts Keepa millimeters and grams', () => {
        const packageProfile = toPackageProfile({
            dimensions: [
                { value: 254, unit: 'millimeters' },
                { value: 203, unit: 'millimeters' },
                { value: 25, unit: 'millimeters' },
            ],
            weight: { value: 136, unit: 'grams' },
        });

        expect(packageProfile?.dimensionsInches.map(value => value.toFixed(3))).toEqual([
            '0.984',
            '7.992',
            '10.000',
        ]);
        expect(
            classifyMerchListing({ bullets: [], hasProductIdentifier: false, packageProfile })
        ).toMatchObject({ isMerchListing: true });
    });

    it('converts SP-API centimeters and kilograms', () => {
        // Dr. Seuss B079PQPLT3.
        const packageProfile = toPackageProfile({
            dimensions: [
                { value: 2.54, unit: 'centimeters' },
                { value: 20.32, unit: 'centimeters' },
                { value: 25.4, unit: 'centimeters' },
            ],
            weight: { value: 0.136, unit: 'kilograms' },
        });

        expect(
            classifyMerchListing({ bullets: [], hasProductIdentifier: false, packageProfile })
        ).toMatchObject({ isMerchListing: true });
    });

    it('has no profile for an unknown unit or a missing measurement', () => {
        expect(
            toPackageProfile({
                dimensions: [inches(10), inches(8), { value: 1, unit: 'cubits' }],
                weight: pounds(0.3),
            })
        ).toBeNull();
        expect(
            toPackageProfile({
                dimensions: [inches(10), inches(8), inches(1)],
                weight: { value: -1, unit: 'grams' },
            })
        ).toBeNull();
        expect(
            toPackageProfile({
                dimensions: [inches(10), inches(8), inches(1)],
                weight: { value: 4.8, unit: 'ounces' },
            })
        ).toEqual({ dimensionsInches: [1, 8, 10], weightPounds: 0.3 });
    });

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
            })
        ).toEqual({ dimensionsInches: [4, 4, 4], weightPounds: 0.5 });
        expect(
            findUnmatchedMerchPackage({
                bullets: templateBullets,
                hasProductIdentifier: false,
                packageProfile: standardTeePackage,
            })
        ).toBeNull();
        expect(
            findUnmatchedMerchPackage({
                bullets: ['Seller bullet'],
                hasProductIdentifier: false,
                packageProfile: unknownPackage,
            })
        ).toBeNull();
    });
});
