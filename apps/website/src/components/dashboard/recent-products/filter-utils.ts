import type {
	FilterState,
	Product,
} from "@/components/dashboard/recent-products/types";
import { LAST_UPDATED_HOURS } from "@/components/dashboard/recent-products/types";

const HOUR_IN_MS = 60 * 60 * 1000;

export const hydrateProducts = (
	items: Array<Omit<Product, "lastFetchedMs">>,
): Product[] =>
	items.map((product) => ({
		...product,
		lastFetchedMs: toValidTimestamp(product.lastFetched),
	}));

export const filterProducts = ({
	activeFacetKeys,
	filters,
	products,
}: {
	activeFacetKeys: string[];
	filters: FilterState;
	products: Product[];
}) => {
	const bsrRange = filters.bsrRange;
	const marketplaceSet =
		filters.marketplaceIds.length > 0 ? new Set(filters.marketplaceIds) : null;
	const activeFacetSet =
		activeFacetKeys.length > 0 ? new Set(activeFacetKeys) : null;
	const cutoffMs =
		filters.lastUpdated === "all"
			? null
			: Date.now() - LAST_UPDATED_HOURS[filters.lastUpdated] * HOUR_IN_MS;

	return products.filter((product) => {
		if (bsrRange) {
			const bsr = product.rootCategoryBsr;
			if (bsr === null || bsr < bsrRange[0] || bsr > bsrRange[1]) {
				return false;
			}
		}
		if (marketplaceSet && !marketplaceSet.has(product.marketplaceId)) {
			return false;
		}
		if (cutoffMs !== null && product.lastFetchedMs < cutoffMs) {
			return false;
		}
		if (activeFacetSet) {
			const hasFacetMatch = product.facets.some((facet) =>
				activeFacetSet.has(toFacetKey(facet)),
			);
			if (!hasFacetMatch) {
				return false;
			}
		}
		return true;
	});
};

const toValidTimestamp = (value: string) => {
	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const toFacetKey = (facet: { facet: string; name: string }) =>
	`${facet.facet}:${facet.name}`;
