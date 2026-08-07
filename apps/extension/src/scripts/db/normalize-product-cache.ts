import type { Product } from "../types/product";

export type CachedProductRecord = Omit<Product, "freshness"> & {
	freshness?: Product["freshness"];
};

export const normalizeCachedProduct = (
	cached: CachedProductRecord
): Product => ({
	...cached,
	isMerchListing: cached.isMerchListing ?? null,
	freshness: cached.freshness ?? {
		stale: true,
		updatedAt: null,
	},
});
