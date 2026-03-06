import type {
	HistoryCustomRange,
	HistoryPickerRange,
	HistoryRangeSelectionKey,
} from "@rankwrangler/history-chart/history-chart-range";
import {
	HISTORY_RANGE_PRESETS,
	type HistoryRangePresetKey,
} from "@rankwrangler/history-chart/history-chart-types";

export type HistoryPoint = { timestamp: number; value: number };
export type HistoryTimeDomain = { startAt: number; endAt: number };

export type CategoryOption = { id: number; name: string | null };
export type SelectOption = { value: string; label: string };

export type ProductHistoryPanelProduct = {
	asin: string;
	marketplaceId: string;
	title: string | null;
	thumbnailUrl: string | null;
	brand: string | null;
	facets: Array<{ facet: string; name: string }>;
	dateFirstAvailable: string | null;
	rootCategoryBsr: number | null;
	rootCategoryDisplayName: string | null;
	isMerchListing: boolean;
	productLastFetchedAt: string | null;
	productInfoCached: boolean | null;
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
