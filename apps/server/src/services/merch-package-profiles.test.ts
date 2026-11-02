import { describe, expect, it } from 'bun:test';
import {
    matchesMerchPackageProfile,
    type PackageProfile,
    toPackageProfile,
} from '@/services/merch-package-profiles';

const inches = (value: number) => ({ value, unit: 'inches' });
const pounds = (value: number) => ({ value, unit: 'pounds' });

describe('Merch package profiles', () => {
    it('converts millimeters and grams', () => {
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
        expect(matches(packageProfile)).toBe(true);
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

        expect(matches(packageProfile)).toBe(true);
    });

    it('matches the crossbody bag', () => {
        // Merch crossbody bag B0HM8DNYRQ.
        expect(
            matches(
                toPackageProfile({
                    dimensions: [inches(6), inches(8), inches(5)],
                    weight: pounds(1),
                })
            )
        ).toBe(true);
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
});

const matches = (packageProfile: PackageProfile | null) =>
    packageProfile !== null && matchesMerchPackageProfile(packageProfile);
