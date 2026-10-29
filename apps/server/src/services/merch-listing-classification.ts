import { MERCH_TEMPLATE_BULLETS_BY_PRODUCT_TYPE } from '@/services/merch-template-bullets';

const MAX_SELLER_BULLETS_TO_PERSIST = 2;

/**
 * Merch on Demand assigns every listing an 11-character uppercase alphanumeric design code as its
 * part number, sometimes followed by a 10-character `B0…` ASIN-like suffix. The code is a random mix
 * of letters and digits: it has at least one letter and never five digits in a row. Other sellers'
 * 11-character codes are structured prefixes plus serial numbers (`YES33194325`, `PARD345624D`,
 * `PPAX1364775`, `83344X08001`), which the digit-run rule keeps out.
 */
const MERCH_PART_NUMBER_PATTERN =
    /^(?=[A-Z0-9]{0,10}[A-Z])(?![A-Z0-9]{0,6}\d{5})[A-Z0-9]{11}(?:B0[A-Z0-9]{8})?$/;

export type BulletEvidence =
    | { kind: 'available'; bullets: readonly string[] }
    | { kind: 'unavailable' };

export interface MerchListingEvidence {
    bullets: BulletEvidence;
    partNumber: string | null;
    modelNumber?: string | null;
    title?: string | null;
}

// A part-number match alone also fits some structured catalog codes (`ULGS322B01S`, `FG3H8900WHT`,
// `MINGLUO0121`). Merch listings never carry a model number and always name their Merch product
// in the title, so a part-number match counts only with both.
const MERCH_PRODUCT_IN_TITLE =
    /\b(t-?shirts?|tees?|shirts?|tank tops?|crop tops?|tops?|raglans?|jerseys?|sweatshirts?|crewnecks?|hoodies?|hoody|pullovers?|zip|polos?|quarter-zip|jackets?|hats?|caps?|visors?|backpacks?|popsockets?|popgrips?|cases?|totes?|bags?|crossbody|laptop sleeve|mouse ?pads?|pillows?|blankets?|throws?|posters?|tumblers?|mugs?|cups?|bottles?|journals?|notebooks?|pens?)\b/i;

export interface MerchListingClassification {
    isMerchListing: boolean;
    bullet1: string | null;
    bullet2: string | null;
}

/**
 * Classifies a listing from its bullets and part number. Any Merch template bullet makes it Merch;
 * so does a Merch part-number fingerprint on a listing with no model number whose title names a
 * Merch product. Otherwise any available evidence makes it non-Merch. With neither bullets nor a
 * part number there is no classification.
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
        normalizedBullets.some(isMerchTemplateBullet) ||
        (isMerchPartNumber(partNumber) &&
            !evidence.modelNumber?.trim() &&
            MERCH_PRODUCT_IN_TITLE.test(evidence.title ?? ''));
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
