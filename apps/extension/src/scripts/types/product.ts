import type { ProductHistory as ProductHistoryResponse } from "../content/types";

export interface ProductIdentifier {
	asin: string;
	marketplaceId: string;
}

export interface Product {
	asin: string;
	marketplaceId: string;
	isMerchListing: boolean | null;
	amazonListingStatus: "active" | "deleted";
	creationDate?: string;

	// Root category information
	rootCategoryBsr?: number | null;
	rootCategoryDisplayName?: string | null;

	metadata: {
		success: boolean;
		thumbnailStatus?: "pending" | "available" | "unavailable";
	};
	freshness: {
		stale: boolean;
		updatedAt: string | null;
	};
}

export type ProductHistory = ProductHistoryResponse;

export const getErrorProduct = (
	productIdentifier: ProductIdentifier
): Product => {
	return {
		asin: productIdentifier.asin,
		marketplaceId: productIdentifier.marketplaceId,
		isMerchListing: null,
		amazonListingStatus: "active",
		metadata: {
			success: false,
		},
		freshness: {
			stale: true,
			updatedAt: null,
		},
	};
};
