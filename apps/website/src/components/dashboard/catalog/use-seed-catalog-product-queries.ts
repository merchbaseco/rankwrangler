import { useEffect } from "react";
import type { CatalogRun } from "./types";
import { api, type RouterOutputs } from "@/lib/trpc";

type CatalogProductSeed = {
	marketplaceId: string;
	asin: string;
	product: NonNullable<CatalogRun["results"][number]["currentProduct"]>;
	availability: "pending" | "available" | "unavailable";
};
type ProductRead = RouterOutputs["api"]["app"]["product"]["get"];

export const seedCatalogProductQueries = ({
	seeds,
	setProduct,
}: {
	seeds: CatalogProductSeed[];
	setProduct: (seed: CatalogProductSeed) => void;
}) => {
	for (const seed of seeds) {
		setProduct(seed);
	}
};

export const selectFreshestProductRead = (
	current: ProductRead | undefined,
	seed: NonNullable<ProductRead>,
) => {
	if (!current) {
		return seed;
	}

	return getLatestSourceTimestamp(current) > getLatestSourceTimestamp(seed)
		? current
		: seed;
};

export const useSeedCatalogProductQueries = (run: CatalogRun | null) => {
	const utils = api.useUtils();

	useEffect(() => {
		const seeds =
			run?.results.flatMap((result) => {
				const product = result.currentProduct;
				if (!product) {
					return [];
				}
				return [
					{
						marketplaceId: product.marketplaceId,
						asin: product.asin,
						product,
						availability: result.currentProductAvailability,
					},
				];
			}) ?? [];

		seedCatalogProductQueries({
			seeds,
			setProduct: (seed) => {
				const productRead = {
					product: seed.product,
					availability: seed.availability,
				};
				utils.api.app.product.get.setData(
					{
						marketplaceId: seed.marketplaceId,
						asin: seed.asin,
					},
					(current) => selectFreshestProductRead(current, productRead),
				);
			},
		});
	}, [run, utils]);
};

const getLatestSourceTimestamp = (read: NonNullable<ProductRead>) => {
	const timestamps = [
		read.product.metadata.updatedAt,
		read.product.keepa?.fetchedAt ?? null,
	].flatMap(value => {
		if (!value) {
			return [];
		}
		const timestamp = Date.parse(value);
		return Number.isNaN(timestamp) ? [] : [timestamp];
	});

	return Math.max(0, ...timestamps);
};
