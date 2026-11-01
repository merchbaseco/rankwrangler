/**
 * Package dimensions and weight that the Merch on Demand pipeline sets on every listing of a
 * product type. A listing whose package matches a row is packed like Merch; providers report the
 * same values in different units, so observations convert to inches and pounds first.
 */
export interface PackageMeasure {
    readonly value: number;
    readonly unit: string;
}

export interface PackageObservation {
    readonly dimensions: readonly [PackageMeasure, PackageMeasure, PackageMeasure];
    readonly weight: PackageMeasure;
}

/** Dimensions in inches, sorted ascending; weight in pounds. */
export interface PackageProfile {
    readonly dimensionsInches: readonly [number, number, number];
    readonly weightPounds: number;
}

interface MerchPackageProfile extends PackageProfile {
    readonly productTypes: readonly string[];
}

const DIMENSION_TOLERANCE_INCHES = 0.06;
const WEIGHT_TOLERANCE_POUNDS = 0.01;

const INCHES_PER_UNIT: Readonly<Record<string, number>> = {
    inches: 1,
    centimeters: 1 / 2.54,
    millimeters: 1 / 25.4,
};

const POUNDS_PER_UNIT: Readonly<Record<string, number>> = {
    pounds: 1,
    ounces: 1 / 16,
    kilograms: 1 / 0.453_592_37,
    grams: 1 / 453.592_37,
};

export const MERCH_PACKAGE_PROFILES: readonly MerchPackageProfile[] = [
    {
        dimensionsInches: [1, 8, 10],
        weightPounds: 0.3,
        productTypes: [
            'standard tee',
            'premium tee',
            'V-neck',
            'tank',
            'tri-blend',
            'performance',
            'heavyweight',
            'kids tee',
            'polo',
        ],
    },
    {
        dimensionsInches: [1, 10, 10],
        weightPounds: 0.3,
        productTypes: ['Comfort Colors tee', 'crop top'],
    },
    { dimensionsInches: [2, 10, 10], weightPounds: 0.3, productTypes: ['raglan'] },
    {
        dimensionsInches: [2, 10, 10],
        weightPounds: 0.5,
        productTypes: ['long sleeve', 'quarter-zip'],
    },
    { dimensionsInches: [1, 9, 10], weightPounds: 0.3, productTypes: ['jersey'] },
    {
        dimensionsInches: [3, 10, 12],
        weightPounds: 1,
        productTypes: ['crewneck sweatshirt', 'crop sweatshirt'],
    },
    {
        dimensionsInches: [5, 12, 12],
        weightPounds: 1.3,
        productTypes: ['pullover hoodie', 'zip hoodie', 'jacket'],
    },
    { dimensionsInches: [0.3, 3.4, 4.3], weightPounds: 0.03, productTypes: ['PopSockets'] },
    { dimensionsInches: [0.75, 4.75, 7.75], weightPounds: 0.34, productTypes: ['phone case'] },
    { dimensionsInches: [5, 5, 6], weightPounds: 0.34, productTypes: ['mug'] },
    { dimensionsInches: [3.7, 3.78, 7.28], weightPounds: 0.723, productTypes: ['tumbler'] },
    { dimensionsInches: [3.4, 4, 11.4], weightPounds: 0.961, productTypes: ['water bottle'] },
    {
        dimensionsInches: [0.6, 5.1, 8.25],
        weightPounds: 0.787,
        productTypes: ['hardcover journal'],
    },
    { dimensionsInches: [1, 6.75, 10], weightPounds: 0.3, productTypes: ['pens'] },
    { dimensionsInches: [3, 3, 20], weightPounds: 0.5, productTypes: ['poster'] },
    { dimensionsInches: [0.5, 8, 10], weightPounds: 0.5, productTypes: ['mouse pad'] },
    { dimensionsInches: [1, 12, 16], weightPounds: 0.7, productTypes: ['laptop sleeve'] },
    { dimensionsInches: [3, 16, 22], weightPounds: 1.8, productTypes: ['backpack'] },
    { dimensionsInches: [5, 7, 9], weightPounds: 0.38, productTypes: ['hat'] },
    { dimensionsInches: [2, 9.5, 14.5], weightPounds: 0.7, productTypes: ['tote'] },
    { dimensionsInches: [7, 10, 18], weightPounds: 1.1, productTypes: ['throw pillow'] },
];

/** Converts an observation to inches and pounds; an unknown unit or a non-positive value is no profile. */
export const toPackageProfile = (observation: PackageObservation): PackageProfile | null => {
    const dimensions = observation.dimensions.map(measure => convert(measure, INCHES_PER_UNIT));
    const weightPounds = convert(observation.weight, POUNDS_PER_UNIT);
    if (weightPounds === null || !dimensions.every(value => value !== null)) {
        return null;
    }
    const [small, middle, large] = dimensions.sort((left, right) => left - right);
    return { dimensionsInches: [small, middle, large], weightPounds };
};

export const matchesMerchPackageProfile = (profile: PackageProfile) =>
    MERCH_PACKAGE_PROFILES.some(
        row =>
            Math.abs(row.weightPounds - profile.weightPounds) <= WEIGHT_TOLERANCE_POUNDS &&
            row.dimensionsInches.every(
                (inches, index) =>
                    Math.abs(inches - profile.dimensionsInches[index]) <= DIMENSION_TOLERANCE_INCHES
            )
    );

const convert = (measure: PackageMeasure, factors: Readonly<Record<string, number>>) => {
    const factor = Object.hasOwn(factors, measure.unit) ? factors[measure.unit] : undefined;
    return factor !== undefined && Number.isFinite(measure.value) && measure.value > 0
        ? measure.value * factor
        : null;
};
