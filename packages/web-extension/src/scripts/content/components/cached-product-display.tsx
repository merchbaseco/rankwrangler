import { useEffect, useState } from "react";
import { getProduct } from "@/scripts/api/get-product";
import { ProductCache } from "@/scripts/db/product-cache";
import type { Product, ProductIdentifier } from "@/scripts/types/product";
import { ProductDisplay } from "./product-display";

export const CachedProductDisplay = (productIdentifier: ProductIdentifier) => {
	const [state, setState] = useState<
		"loading" | "success" | "error"
	>("loading");
	const [product, setProduct] = useState<Product>();

	useEffect(() => {
		async function loadBsr() {
			try {
				const cachedProduct = await ProductCache.get(productIdentifier);

				if (cachedProduct) {
					setState("success");
					setProduct(cachedProduct);
					return;
				}

				// Fetch product info
				const product = await getProduct(productIdentifier);

				if (product.metadata.success) {
					await ProductCache.set(product);
					setState("success");
					setProduct(product);
				} else {
					throw new Error();
				}
			} catch (_e) {
				setState("error");
			}
		}

		loadBsr();
	}, [productIdentifier]);

	return (
		<ProductDisplay
			product={product}
			isLoading={state === "loading"}
			isError={state === "error"}
		/>
	);
};
