import type {
	HistoryCustomRange,
	HistoryPickerRange,
	HistoryRangeSelectionKey,
} from "@rankwrangler/history-chart/history-chart-range";
import {
	HISTORY_RANGE_PRESETS,
	type HistoryRangePresetKey,
} from "@rankwrangler/history-chart/history-chart-types";
import type { ProductThumbnail } from "@/components/dashboard/product-thumbnail";
import type { ProductProvenance } from "./product-provenance";

export type HistoryPoint = { timestamp: number; value: number };
export type HistoryTimeDomain = { startAt: number; endAt: number };

export type CategoryOption = { id: number; name: string | null };
export type SelectOption = { value: string; label: string };

export type ProductFreshness = {
	stale: boolean;
	updatedAt: string | null;
};

export type ProductHistoryPanelProduct = {
	asin: string;
	marketplaceId: string;
	amazonListingStatus: "active" | "deleted";
	title: string | null;
	thumbnail: ProductThumbnail;
	brand: string | null;
	facets: Array<{ facet: string; name: string }>;
	dateFirstAvailable: string | null;
	rootCategoryBsr: number | null;
	rootCategoryDisplayName: string | null;
	isMerchListing: boolean | null;
	freshness: ProductFreshness;
	provenance?: ProductProvenance | null;
};

export type ProductHistoryPanelProps = {
	product: ProductHistoryPanelProduct;
};

export const DATE_RANGES = HISTORY_RANGE_PRESETS;

export type DateRangeKey = HistoryRangePresetKey;
export type ActiveRange = HistoryRangeSelectionKey;
export type PickerValue = HistoryCustomRange;
export type PickerRange = HistoryPickerRange;

export type HistoryQueryResult = {
	data?: {
		points: {
			isMissing: boolean;
			value: number | null;
			observedAt: string;
		}[];
	};
	isLoading: boolean;
	isError: boolean;
	error?: { message: string } | null;
};
