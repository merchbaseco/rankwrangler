import type { CatalogResult } from "./types";
import { api } from "@/lib/trpc";

type CatalogProduct = NonNullable<CatalogResult["currentProduct"]>;

export const useCatalogProductQuery = ({
	initialProduct,
	initialSyncPending,
}: {
	initialProduct: CatalogProduct;
	initialSyncPending: boolean;
}) => {
	return api.api.app.product.get.useQuery(
		{
			marketplaceId: initialProduct.marketplaceId,
			asin: initialProduct.asin,
		},
		{
			initialData: {
				product: initialProduct,
				syncPending: initialSyncPending,
			},
			refetchOnWindowFocus: false,
			staleTime: Number.POSITIVE_INFINITY,
		},
	);
};
