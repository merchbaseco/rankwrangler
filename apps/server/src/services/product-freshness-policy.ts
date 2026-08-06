export const PRODUCT_DEFAULT_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export const isProductFresh = (fetchedAt: Date | null, now = Date.now()) =>
    Boolean(fetchedAt) && now - (fetchedAt?.getTime() ?? 0) <= PRODUCT_DEFAULT_MAX_AGE_MS;
