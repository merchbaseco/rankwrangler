import type { CatalogResult } from "./types";
import { api } from "@/lib/trpc";

type CatalogProduct = NonNullable<CatalogResult["currentProduct"]>;

export const useCatalogProductQuery = ({
	initialProduct,
	initialAvailability,
}: {
	initialProduct: CatalogProduct;
	initialAvailability: "pending" | "available" | "unavailable";
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
				availability: initialAvailability,
			},
			refetchOnWindowFocus: false,
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
};
