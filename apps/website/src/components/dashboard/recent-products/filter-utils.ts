import type {
		Product,
} from "@/components/dashboard/recent-products/types";

export const hydrateProducts = (
	items: Array<
			Omit<Product, "updatedAt" | "updatedAtMs"> & {
			updatedAt?: string;
		}
	>,
): Product[] =>
	items.map((product) => {
		const updatedAt = product.updatedAt ?? "";
		return {
			...product,
			updatedAt,
			updatedAtMs: toValidTimestamp(updatedAt),
		};
	});

const toValidTimestamp = (value: string | null) => {
	const timestamp = Date.parse(value ?? "");
	return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const toFacetKey = (facet: { facet: string; name: string }) =>
	`${facet.facet}:${facet.name}`;
