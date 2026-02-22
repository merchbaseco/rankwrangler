export const MERCH_TEMPLATE_BULLETS = [
    'Lightweight, Classic fit, Double-needle sleeve and bottom hem',
    '8.5 oz, Classic fit, Twill-taped neck',
    'Comfort Colors offers a relaxed fit in adult sizes. Size up for an oversized fit.',
    'Solid colors: soft-washed, garment-dyed fabric for a lived in feel; tie dye: pigment-dyed to create unique variations',
    'Dual wall insulated: keeps beverages hot or cold',
    'Stainless Steel, BPA Free',
    'Leak proof lid with clear slider',
    'Dual-wall insulated stainless steel construction keeps beverages hot or cold, top rack dishwasher safe and BPA free',
    'Leak-proof flip lid includes BPA free plastic drinking straw',
] as const;

type MerchBulletClassification = {
    isMerchListing: boolean;
    merchBullets: string[];
    sellerBullets: string[];
    bullet1: string | null;
    bullet2: string | null;
};

const MAX_SELLER_BULLETS_TO_PERSIST = 2;

export const classifyMerchBullets = (
    bulletPoints: string[]
): MerchBulletClassification => {
    const normalizedBullets = dedupeAndNormalizeBullets(bulletPoints);
    if (normalizedBullets.length === 0) {
        return {
            isMerchListing: false,
            merchBullets: [],
            sellerBullets: [],
            bullet1: null,
            bullet2: null,
        };
    }

    const merchBullets: string[] = [];
    const sellerBullets: string[] = [];

    for (const bullet of normalizedBullets) {
        if (isMerchTemplateBullet(bullet)) {
            merchBullets.push(bullet);
            continue;
        }

        sellerBullets.push(bullet);
    }

    const isMerchListing = merchBullets.length > 0;
    const persistedSellerBullets = isMerchListing
        ? sellerBullets.slice(0, MAX_SELLER_BULLETS_TO_PERSIST)
        : [];

    return {
        isMerchListing,
        merchBullets,
        sellerBullets: persistedSellerBullets,
        bullet1: persistedSellerBullets[0] ?? null,
        bullet2: persistedSellerBullets[1] ?? null,
    };
};

const isMerchTemplateBullet = (bullet: string) => {
    return merchTemplateBulletSet.has(normalizeBulletForMatching(bullet));
};

const dedupeAndNormalizeBullets = (bulletPoints: string[]) => {
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
    MERCH_TEMPLATE_BULLETS.map(bullet => normalizeBulletForMatching(bullet))
);
