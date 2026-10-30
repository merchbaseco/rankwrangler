import { db } from '@/db/index';
import { familyIdentityKey, resolveFamilyIdentities } from '@/db/product/product-family';

/**
 * Maps a requested ASIN to the stored family it belongs to, so a size or color variant reads the
 * same Product as its parent. Unknown ASINs come back unchanged.
 */
export const resolveProductIdentity = async <T extends { marketplaceId: string; asin: string }>(
    input: T
): Promise<T> => {
    const identity = { marketplaceId: input.marketplaceId, asin: input.asin.trim().toUpperCase() };
    const families = await resolveFamilyIdentities(db, [identity]);
    return { ...input, asin: families.get(familyIdentityKey(identity))?.asin ?? identity.asin };
};
