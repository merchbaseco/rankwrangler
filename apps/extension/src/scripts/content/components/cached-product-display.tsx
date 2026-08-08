import { useCallback, useEffect, useState } from "react";
import { getProduct } from "@/scripts/api/get-product";
import { ProductCache } from "@/scripts/db/product-cache";
import type { Product, ProductIdentifier } from "@/scripts/types/product";
import { log } from "../../../utils/logger";
import { recordCacheLookup } from "../debug/debug-snapshot";
import { ProductDisplay } from "./product-display";

type CachedProductDisplayProps = ProductIdentifier & {
	mode: "detail" | "search";
};

export const CachedProductDisplay = ({
	asin,
	marketplaceId,
	mode,
}: CachedProductDisplayProps) => {
	const [isLoading, setIsLoading] = useState(true);
	const [isError, setIsError] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [refreshError, setRefreshError] = useState<string | null>(null);
	const [product, setProduct] = useState<Product>();

	const refreshProduct = useCallback(async () => {
		if (isRefreshing) {
			return;
		}

		setIsRefreshing(true);
		setRefreshError(null);
		const liveProduct = await getProduct({ asin, marketplaceId });
		if (liveProduct.metadata.success) {
			setProduct(liveProduct);
			setIsLoading(false);
			setIsError(false);
		} else {
			setRefreshError("Product refresh failed");
			if (!product) {
				setIsError(mode === "detail");
			}
		}
		setIsRefreshing(false);
	}, [asin, isRefreshing, marketplaceId, mode, product]);

	useEffect(() => {
		let isUnmounted = false;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let hasAvailableProduct = false;
		let backgroundRefreshAttempts = 0;
		const productIdentifier: ProductIdentifier = { asin, marketplaceId };

		const loadLiveProduct = async () => {
			const liveProduct = await getProduct(productIdentifier);
			if (isUnmounted) {
				return;
			}

			if (liveProduct.metadata.success) {
				hasAvailableProduct = true;
				setProduct(liveProduct);
				setIsLoading(false);
				setIsError(false);
				if (liveProduct.freshness.stale && backgroundRefreshAttempts < 3) {
					backgroundRefreshAttempts += 1;
					retryTimer = setTimeout(() => {
						loadLiveProduct().catch((error) =>
							log.error("Product retry failed", { error })
						);
					}, 5000);
				}
				return;
			}

			if (mode === "search" && !hasAvailableProduct) {
				retryTimer = setTimeout(() => {
					loadLiveProduct().catch((error) =>
						log.error("Product retry failed", { error })
					);
				}, 5000);
				return;
			}

			if (!hasAvailableProduct) {
				setIsLoading(false);
				setIsError(true);
			}
		};

		const load = async () => {
			setIsLoading(true);
			setIsError(false);
			try {
				const cachedProduct = await ProductCache.get(productIdentifier);
				if (cachedProduct) {
					hasAvailableProduct = true;
					recordCacheLookup(productIdentifier, "hit", cachedProduct);
					if (isUnmounted) {
						return;
					}
					setProduct(cachedProduct);
					setIsLoading(false);
					loadLiveProduct().catch((error) =>
						log.error("Live Product refresh failed", { error })
					);
					return;
				}

				recordCacheLookup(productIdentifier, "miss");
				await loadLiveProduct();
			} catch (error) {
				log.error("CachedProductDisplay failed to load BSR", {
					asin,
					marketplaceId,
					error,
				});
				if (!isUnmounted && mode === "detail") {
					setIsLoading(false);
					setIsError(true);
				}
			}
		};

		load().catch((error) =>
			log.error("Product display load failed", { error })
		);
		return () => {
			isUnmounted = true;
			if (retryTimer) {
				clearTimeout(retryTimer);
			}
		};
	}, [asin, marketplaceId, mode]);

	return (
		<ProductDisplay
			isError={isError}
			isLoading={isLoading}
			isRefreshing={isRefreshing}
			mode={mode}
			onRefresh={mode === "detail" ? refreshProduct : undefined}
			product={product}
			refreshError={refreshError}
		/>
	);
};
