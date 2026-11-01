import { matchesMerchPackageProfile, type PackageProfile } from '@/services/merch-package-profiles';
import { MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE } from '@/services/merch-template-bullets';

const MAX_SELLER_BULLETS_TO_PERSIST = 2;

/** What one catalog observation (an SP-API item or a Keepa product) shows about its listing. */
export interface MerchListingEvidence {
    readonly bullets: readonly string[];
    /** A UPC, EAN or GTIN; Merch on Demand never assigns one. */
    readonly hasProductIdentifier: boolean;
    readonly packageProfile: PackageProfile | null;
}

export interface MerchListingClassification {
    readonly isMerchListing: boolean;
    readonly bullet1: string | null;
    readonly bullet2: string | null;
}

/**
 * The Merch on Demand pipeline stamps every listing with its product type's template bullets and
 * package profile and never assigns a product identifier. A listing is Merch when it has no product
 * identifier and shows either stamp. A Merch listing keeps its first two non-template bullets as
 * seller bullets.
 */
export const classifyMerchListing = (
    evidence: MerchListingEvidence
): MerchListingClassification => {
    const bullets = dedupeAndNormalizeBullets(evidence.bullets);
    const isMerchListing =
        !evidence.hasProductIdentifier &&
        (bullets.some(isMerchTemplateBullet) || hasMerchPackageProfile(evidence.packageProfile));
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

const hasMerchPackageProfile = (profile: PackageProfile | null) =>
    profile !== null && matchesMerchPackageProfile(profile);

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
