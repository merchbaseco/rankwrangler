import { LAST_UPDATED_HOURS } from '@/components/dashboard/recent-products/types';
import type { FilterState, Product } from '@/components/dashboard/recent-products/types';

const HOUR_IN_MS = 60 * 60 * 1000;

export const hydrateProducts = (items: Array<Omit<Product, 'lastFetchedMs'>>): Product[] =>
	items.map((product) => ({
		...product,
		lastFetchedMs: toValidTimestamp(product.lastFetched),
	}));

export const filterProducts = ({
	filters,
	products,
}: {
	filters: FilterState;
	products: Product[];
}) => {
	const hasBsrFilter = filters.bsrRanges.length > 0;
	const marketplaceSet =
		filters.marketplaceIds.length > 0 ? new Set(filters.marketplaceIds) : null;
	const cutoffMs =
		filters.lastUpdated === 'all'
			? null
			: Date.now() - LAST_UPDATED_HOURS[filters.lastUpdated] * HOUR_IN_MS;

	return products.filter((product) => {
		if (hasBsrFilter && !matchesBsr(product.rootCategoryBsr, filters.bsrRanges)) {
			return false;
		}
		if (marketplaceSet && !marketplaceSet.has(product.marketplaceId)) {
			return false;
		}
		if (cutoffMs !== null && product.lastFetchedMs < cutoffMs) {
			return false;
		}
		return true;
	});
};

const matchesBsr = (
	bsr: number | null,
	bsrRanges: Array<'top1k' | 'top10k' | 'top100k' | '100k+'>,
) => {
	if (bsr === null) {
		return false;
	}

	return bsrRanges.some((range) => {
		if (range === 'top1k') {
			return bsr <= 1000;
		}
		if (range === 'top10k') {
			return bsr <= 10000;
		}
		if (range === 'top100k') {
			return bsr <= 100000;
		}
		return bsr > 100000;
	});
};

const toValidTimestamp = (value: string) => {
	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? 0 : timestamp;
};
