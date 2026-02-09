export interface ProductIdentifier {
	asin: string;
	marketplaceId: string;
}

export interface Product {
	asin: string;
	marketplaceId: string;
	creationDate?: string;

	// Root category information
	rootCategoryBsr?: number | null;
	rootCategoryDisplayName?: string | null;

	metadata: {
		success: boolean;
		lastFetched?: string; // ISO timestamp
		cached?: boolean;
	};
}

export const getErrorProduct = (
	productIdentifier: ProductIdentifier,
): Product => {
	return {
		asin: productIdentifier.asin,
		marketplaceId: productIdentifier.marketplaceId,
		metadata: {
			success: false,
		},
	};
};
