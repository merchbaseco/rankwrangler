import { useQuery } from "@tanstack/react-query";
import { getProduct } from "@/scripts/api/get-product";
import type { ProductIdentifier } from "@/scripts/types/product";

export const useDrawerProductInfo = ({
	enabled,
	productIdentifier,
}: {
	enabled: boolean;
	productIdentifier: ProductIdentifier;
}) => {
	return useQuery({
		queryKey: [
			"drawerProductInfo",
			productIdentifier.marketplaceId,
			productIdentifier.asin,
		],
		queryFn: async () => {
			return await getProduct(productIdentifier);
		},
		enabled,
		retry: 1,
		staleTime: 0,
		refetchOnWindowFocus: false,
	});
};
