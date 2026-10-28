import { MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE } from '@/services/merch-template-bullets';

const MAX_SELLER_BULLETS_TO_PERSIST = 2;

/**
 * Merch on Demand assigns every listing an 11-character uppercase alphanumeric design code as its
 * part number, sometimes followed by a 10-character `B0…` ASIN-like suffix. The design code always
 * contains at least one letter, which keeps 11-digit numeric codes out.
 */
const MERCH_PART_NUMBER_PATTERN = /^(?=[A-Z0-9]{0,10}[A-Z])[A-Z0-9]{11}(?:B0[A-Z0-9]{8})?$/;

export type BulletEvidence =
    | { kind: 'available'; bullets: readonly string[] }
    | { kind: 'unavailable' };

export interface MerchListingEvidence {
    bullets: BulletEvidence;
    partNumber: string | null;
}

export interface MerchListingClassification {
    isMerchListing: boolean;
    bullet1: string | null;
    bullet2: string | null;
}

/**
 * Classifies a listing from its part number and bullets. A Merch part-number fingerprint or any
 * Merch template bullet makes it Merch; otherwise any available evidence makes it non-Merch. With
 * neither bullets nor a part number there is no classification.
 */
export const classifyMerchListing = (
    evidence: MerchListingEvidence
): MerchListingClassification | null => {
    const partNumber = evidence.partNumber?.trim() || null;
    if (evidence.bullets.kind === 'unavailable' && partNumber === null) {
        return null;
    }

    const normalizedBullets =
        evidence.bullets.kind === 'available'
            ? dedupeAndNormalizeBullets(evidence.bullets.bullets)
            : [];
    const isMerchListing =
        isMerchPartNumber(partNumber) || normalizedBullets.some(isMerchTemplateBullet);
    const sellerBullets = isMerchListing
        ? normalizedBullets.filter(bullet => !isMerchTemplateBullet(bullet))
        : [];
    const persistedSellerBullets = sellerBullets.slice(0, MAX_SELLER_BULLETS_TO_PERSIST);

    return {
        isMerchListing,
        bullet1: persistedSellerBullets[0] ?? null,
        bullet2: persistedSellerBullets[1] ?? null,
    };
};

const isMerchPartNumber = (partNumber: string | null) => {
    return partNumber !== null && MERCH_PART_NUMBER_PATTERN.test(partNumber.trim());
};

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
