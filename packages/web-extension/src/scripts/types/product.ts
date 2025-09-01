export interface ProductIdentifier {
	asin: string;
	marketplaceId: string;
}

export interface ProductRanking {
	rank: number;
	category: string;
	link?: string;
}

export interface Product {
	asin: string;
	marketplaceId: string;
	creationDate?: string;
	
	// Primary BSR for filtering/sorting (display group rank if available)
	bsr?: number;
	bsrCategory?: string;
	
	// Detailed rankings matching SP-API structure
	displayGroupRanks: ProductRanking[];  
	classificationRanks: ProductRanking[];
	
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
		displayGroupRanks: [],
		classificationRanks: [],
		metadata: {
			success: false,
		},
	};
};
