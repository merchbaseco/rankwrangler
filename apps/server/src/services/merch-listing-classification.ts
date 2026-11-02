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
    /** A manufacturer, part number and list price, which Merch sets on every listing it creates. */
    readonly hasMerchListingAttributes: boolean;
    /** A description, hazmat or battery declaration, or identifier exemption, which sellers set. */
    readonly hasSellerListingAttributes: boolean;
    readonly isVariationParent: boolean;
}

export interface MerchListingClassification {
    readonly isMerchListing: boolean;
    readonly bullet1: string | null;
    readonly bullet2: string | null;
}

/**
 * The Merch on Demand pipeline stamps every listing with its product type's template bullets and
 * package profile, and sets a manufacturer, part number and list price but no seller attributes. A
 * template bullet alone makes a listing Merch; licensed Merch keeps it beside a UPC. Without one,
 * a Merch listing has no product identifier and the Merch listing attributes, plus either a Merch
 * package or, unless it is a variation parent, no seller attributes: Amazon has rewritten the
 * bullets and remeasured the package of some older Merch listings. A Merch listing keeps its first
 * two non-template bullets as seller bullets.
 */
export const classifyMerchListing = (
    evidence: MerchListingEvidence
): MerchListingClassification => {
    const bullets = dedupeAndNormalizeBullets(evidence.bullets);
    const isMerchListing =
        bullets.some(isMerchTemplateBullet) || showsMerchListingAttributes(evidence);
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
    catalogAttributes.hasMerchListingAttributes &&
    ((packageProfile !== null && matchesMerchPackageProfile(packageProfile)) ||
        (!catalogAttributes.isVariationParent && !catalogAttributes.hasSellerListingAttributes));

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
