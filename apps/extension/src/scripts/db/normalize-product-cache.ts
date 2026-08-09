import type { Product } from "../types/product";

export type CachedProductRecord = Omit<Product, "freshness" | "isUnavailable"> & {
	freshness?: Product["freshness"];
	isUnavailable?: boolean;
};

export const normalizeCachedProduct = (
	cached: CachedProductRecord
): Product => ({
	...cached,
	isMerchListing: cached.isMerchListing ?? null,
	isUnavailable: cached.isUnavailable ?? false,
	freshness: cached.freshness ?? {
		stale: true,
		updatedAt: null,
	},
});
