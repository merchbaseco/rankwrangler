import { matchesMerchPackageProfile, type PackageProfile } from '@/services/merch-package-profiles';
import { MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE } from '@/services/merch-template-bullets';

const MAX_SELLER_BULLETS_TO_PERSIST = 2;

/** What one catalog observation (an SP-API item or a Keepa product) shows about its listing. */
export interface MerchListingEvidence {
    readonly bullets: readonly string[];
    /** A UPC, EAN or GTIN. Seller listings carry one; licensed Merch sometimes does too. */
    readonly hasProductIdentifier: boolean;
    readonly packageProfile: PackageProfile | null;
    /** Null from a source that does not report catalog attributes (Keepa). */
    readonly catalogAttributes: MerchCatalogAttributes | null;
}

export interface MerchCatalogAttributes {
    /** A part number and list price, which Merch sets on every listing it creates. */
    readonly hasMerchListingAttributes: boolean;
    /** A description, skipped offer or title differentiation, which only sellers set. */
    readonly hasSellerListingAttributes: boolean;
    /** A battery, hazmat or identifier-exemption declaration, which some Merch listings carry. */
    readonly hasSupplierDeclarations: boolean;
    readonly isVariationParent: boolean;
    /** A product type Merch sells: a shirt, hat, bag, phone accessory, mug or pillow. */
    readonly isMerchProductType: boolean;
}

export interface MerchListingClassification {
    readonly isMerchListing: boolean;
    readonly bullet1: string | null;
    readonly bullet2: string | null;
}

/**
 * The Merch on Demand pipeline stamps every listing with its product type's template bullets and
 * package profile, and sets a part number and list price but no seller attributes. A template
 * bullet makes a listing Merch, licensed Merch keeps it beside a UPC, but sellers copy template
 * bullets, so where the catalog reports attributes it must also show the Merch listing attributes.
 * Without a template bullet, a Merch listing is a Merch product type with no product identifier,
 * the Merch listing attributes and no seller attributes, plus either a Merch package or, unless it
 * is a variation parent, no supplier declarations: Amazon has rewritten the bullets, remeasured
 * the package and dropped the manufacturer of some older Merch listings.
 * A Merch listing keeps its first two non-template bullets as seller bullets.
 */
export const classifyMerchListing = (
    evidence: MerchListingEvidence
): MerchListingClassification => {
    const bullets = dedupeAndNormalizeBullets(evidence.bullets);
    const isMerchListing =
        (bullets.some(isMerchTemplateBullet) &&
            evidence.catalogAttributes?.hasMerchListingAttributes !== false) ||
        showsMerchListingAttributes(evidence);
    const sellerBullets = isMerchListing
        ? bullets
              .filter(bullet => !isMerchTemplateBullet(bullet))
              .slice(0, MAX_SELLER_BULLETS_TO_PERSIST)
        : [];

    return {
        isMerchListing,
        bullet1: sellerBullets[0] ?? null,
        bullet2: sellerBullets[1] ?? null,
    };
};

/**
 * A Merch template bullet on a package no profile matches means Merch launched or repackaged a
 * product type, and the profile table is missing its row. Returns that package.
 */
export const findUnmatchedMerchPackage = (evidence: MerchListingEvidence) =>
    evidence.packageProfile !== null &&
    !matchesMerchPackageProfile(evidence.packageProfile) &&
    evidence.bullets.some(isMerchTemplateBullet)
        ? evidence.packageProfile
        : null;

const showsMerchListingAttributes = ({
    hasProductIdentifier,
    packageProfile,
    catalogAttributes,
}: MerchListingEvidence) =>
    catalogAttributes !== null &&
    !hasProductIdentifier &&
    catalogAttributes.isMerchProductType &&
    catalogAttributes.hasMerchListingAttributes &&
    !catalogAttributes.hasSellerListingAttributes &&
    (isMerchPackage(packageProfile) ||
        (!catalogAttributes.isVariationParent && !catalogAttributes.hasSupplierDeclarations));

const isMerchPackage = (packageProfile: PackageProfile | null) =>
    packageProfile !== null && matchesMerchPackageProfile(packageProfile);

const isMerchTemplateBullet = (bullet: string) => {
    return merchTemplateBulletSet.has(normalizeBulletForMatching(bullet));
};

const dedupeAndNormalizeBullets = (bulletPoints: readonly string[]) => {
    const normalizedByKey = new Map<string, string>();

    for (const bullet of bulletPoints) {
        const normalizedForStorage = bullet.replace(/\s+/g, ' ').trim();
        if (normalizedForStorage.length === 0) {
            continue;
        }

        const dedupeKey = normalizeBulletForMatching(normalizedForStorage);
        if (!normalizedByKey.has(dedupeKey)) {
            normalizedByKey.set(dedupeKey, normalizedForStorage);
        }
    }

    return [...normalizedByKey.values()];
};

const normalizeBulletForMatching = (bullet: string) => {
    return bullet
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
};

const merchTemplateBulletSet = new Set(
    Object.values(MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE)
        .flat()
        .map(bullet => normalizeBulletForMatching(bullet))
);
