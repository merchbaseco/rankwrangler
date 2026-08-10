import type { CatalogResult } from "./types";
import { api } from "@/lib/trpc";

type CatalogProduct = NonNullable<CatalogResult["currentProduct"]>;

export const useCatalogProductQuery = ({
	initialProduct,
	initialAmazonListingStatus,
}: {
	initialProduct: CatalogProduct;
	initialAmazonListingStatus: "pending" | "active" | "deleted";
}) => {
	return api.api.app.product.get.useQuery(
		{
			marketplaceId: initialProduct.marketplaceId,
			asin: initialProduct.asin,
			refresh: false,
		},
		{
			initialData: {
				product: initialProduct,
				amazonListingStatus: initialAmazonListingStatus,
				provenance: null,
			},
			refetchOnWindowFocus: false,
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
};
