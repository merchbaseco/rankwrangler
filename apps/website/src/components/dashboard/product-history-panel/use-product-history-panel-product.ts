import { useEffect, useState } from "react";
import type { ProductHistoryPanelProduct } from "@/components/dashboard/product-history-panel/types";
import { api } from "@/lib/trpc";

export const useProductHistoryPanelProduct = ({
	product,
}: {
	product: ProductHistoryPanelProduct;
}) => {
	const [resolvedProduct, setResolvedProduct] = useState(product);
	const { mutateAsync } = api.api.app.amazon.product.search.useMutation();
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

	useEffect(() => {
		let isCancelled = false;
		setResolvedProduct({
			asin: product.asin,
			marketplaceId: product.marketplaceId,
			title: product.title,
			thumbnail: product.thumbnail,
			brand: product.brand,
			facets: product.facets,
			dateFirstAvailable: product.dateFirstAvailable,
			rootCategoryBsr: product.rootCategoryBsr,
			rootCategoryDisplayName: product.rootCategoryDisplayName,
			isMerchListing: product.isMerchListing,
			productUpdatedAt: product.productUpdatedAt,
			productInfoCached: product.productInfoCached,
		});

		const run = async () => {
			try {
				const productInfo = await mutateAsync({
					asin: product.asin,
					marketplaceId: product.marketplaceId,
				});
				if (isCancelled) {
					return;
				}

				setResolvedProduct((previous) => ({
					asin: productInfo.asin,
					marketplaceId: productInfo.marketplaceId,
					title: productInfo.title,
					thumbnail: productInfo.thumbnail,
					brand: productInfo.brand,
					// Preserve facets loaded from DB query to avoid async overwrite races.
					facets: previous.facets,
					dateFirstAvailable: productInfo.dateFirstAvailable,
					rootCategoryBsr: productInfo.rootCategoryBsr,
					rootCategoryDisplayName: productInfo.rootCategoryDisplayName,
					isMerchListing: productInfo.isMerchListing,
					productUpdatedAt: productInfo.metadata.updatedAt,
					productInfoCached: productInfo.metadata.cached,
				}));
			} catch {
				if (isCancelled) {
					return;
				}
				// Keep the selected table-row product when amazon product search fails.
			}
		};

		void run();

		return () => {
			isCancelled = true;
		};
	}, [
		mutateAsync,
		product.asin,
		product.marketplaceId,
		product.title,
		product.thumbnail,
		product.brand,
		product.facets,
		product.dateFirstAvailable,
		product.rootCategoryBsr,
		product.rootCategoryDisplayName,
		product.isMerchListing,
		product.productUpdatedAt,
		product.productInfoCached,
	]);

	useEffect(() => {
		if (!facetsQuery.data) {
			return;
		}
		setResolvedProduct((previous) => ({
			...previous,
			facets: facetsQuery.data,
		}));
	}, [facetsQuery.data]);

	return resolvedProduct;
};
