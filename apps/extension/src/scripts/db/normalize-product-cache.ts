import type { Product } from "../types/product";

export type CachedProductRecord = Omit<
	Product,
	"freshness" | "amazonListingStatus"
> & {
	freshness?: Product["freshness"];
	amazonListingStatus?: Product["amazonListingStatus"];
};

export const normalizeCachedProduct = (
	cached: CachedProductRecord
): Product => ({
	...cached,
	isMerchListing: cached.isMerchListing ?? null,
	amazonListingStatus: cached.amazonListingStatus ?? "active",
	freshness: cached.freshness ?? {
		stale: true,
		updatedAt: null,
	},
});
