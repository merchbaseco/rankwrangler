import { useMemo } from "react";
import type { ProductHistoryPanelProduct } from "@/components/dashboard/product-history-panel/types";
import { api } from "@/lib/trpc";
import { useProductDetails } from "./use-product-details";

export const useProductHistoryPanelProduct = ({
	product,
}: {
	product: ProductHistoryPanelProduct;
}) => {
	const productDetails = useProductDetails({
		asin: product.asin,
		marketplaceId: product.marketplaceId,
	});
	const facetsQuery = api.api.app.getProductFacets.useQuery(
		{
			marketplaceId: product.marketplaceId,
			asin: product.asin,
		},
		{
			refetchOnWindowFocus: false,
			staleTime: 30_000,
		},
	);

	const resolvedProduct = useMemo(() => {
		const details = productDetails.product;
		if (!details) {
			return {
				...product,
				facets: facetsQuery.data ?? product.facets,
			};
		}

		return {
			...product,
			asin: details.asin,
			marketplaceId: details.marketplaceId,
			title: details.title,
			thumbnail: details.thumbnail,
			brand: details.brand,
			facets: facetsQuery.data ?? product.facets,
			dateFirstAvailable: details.dateFirstAvailable,
			rootCategoryBsr: details.rootCategoryBsr,
			rootCategoryDisplayName: details.rootCategoryDisplayName,
			isMerchListing: details.isMerchListing,
			freshness: details.freshness,
		};
	}, [facetsQuery.data, product, productDetails.product]);

	return {
		product: resolvedProduct,
		isProductRefreshing: productDetails.isRefreshing,
		productRefreshError: productDetails.refreshError,
		triggerProductRefresh: productDetails.refresh,
	};
};
