import type { DateRange } from 'react-day-picker';

export type HistoryPoint = { timestamp: number; value: number };

export type CategoryOption = { id: number; name: string | null };
export type SelectOption = { value: string; label: string };

export type ProductHistoryPanelProduct = {
	asin: string;
	marketplaceId: string;
	title: string | null;
	thumbnailUrl: string | null;
	brand: string | null;
};

export type ProductHistoryPanelProps = {
	product: ProductHistoryPanelProduct;
};

export const DATE_RANGES = [
	{ key: '30d', label: '30 days', days: 30 },
	{ key: '90d', label: '90 days', days: 90 },
	{ key: '6m', label: '6 months', days: 180 },
	{ key: '1y', label: '1 year', days: 365 },
	{ key: 'all', label: 'All time', days: null },
] as const;

export type DateRangeKey = (typeof DATE_RANGES)[number]['key'];
export type ActiveRange = DateRangeKey | 'custom';
export type PickerValue = [Date, Date] | null;
export type PickerRange = DateRange | undefined;

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
