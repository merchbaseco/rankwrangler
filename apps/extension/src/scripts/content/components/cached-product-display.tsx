import { useEffect, useState } from "react";
import { getProduct } from "@/scripts/api/get-product";
import { ProductCache } from "@/scripts/db/product-cache";
import type { Product, ProductIdentifier } from "@/scripts/types/product";
import { log } from "../../../utils/logger";
import { ProductDisplay } from "./product-display";

export const CachedProductDisplay = ({
	asin,
	marketplaceId,
}: ProductIdentifier) => {
	const [state, setState] = useState<"loading" | "success" | "error">(
		"loading"
	);
	const [product, setProduct] = useState<Product>();

	useEffect(() => {
		let isUnmounted = false;

		async function loadBsr() {
			setState("loading");

			const productIdentifier: ProductIdentifier = { asin, marketplaceId };

			try {
				const cachedProduct = await ProductCache.get(productIdentifier);

				if (cachedProduct) {
					if (isUnmounted) {
						return;
					}

					setState("success");
					setProduct(cachedProduct);
					return;
				}

				// Fetch product info
				const product = await getProduct(productIdentifier);

				if (product.metadata.success) {
					if (isUnmounted) {
						return;
					}

					setState("success");
					setProduct(product);
				} else {
					throw new Error("Failed to fetch product metadata.");
				}
			} catch (error) {
				log.error("CachedProductDisplay failed to load BSR", {
					asin,
					marketplaceId,
					error,
				});

				if (isUnmounted) {
					return;
				}

				setState("error");
			}
		}

		loadBsr();

		return () => {
			isUnmounted = true;
		};
	}, [asin, marketplaceId]);

	return (
		<ProductDisplay
			isError={state === "error"}
			isLoading={state === "loading"}
			product={product}
		/>
	);
};
