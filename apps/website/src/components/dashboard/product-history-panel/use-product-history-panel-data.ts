import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import type {
	ActiveRange,
	CategoryOption,
	DateRangeKey,
	PickerRange,
	PickerValue,
	ProductHistoryPanelProduct,
	SelectOption,
} from '@/components/dashboard/product-history-panel/types';
import { DATE_RANGES } from '@/components/dashboard/product-history-panel/types';
import { toastManager } from '@/components/ui/toast';
import { api } from '@/lib/trpc';

const KEEPA_STALE_REFRESH_MS = 48 * 60 * 60 * 1000;

export const useProductHistoryPanelData = ({
	product,
}: {
	product: ProductHistoryPanelProduct;
}) => {
	const [activePreset, setActivePreset] = useState<ActiveRange>('1y');
	const [customRange, setCustomRange] = useState<PickerValue>(null);
	const [datePickerRange, setDatePickerRange] = useState<PickerRange>();
	const [rankMetricValue, setRankMetricValue] = useState<string>('bsrMain');

	const { startAt, endAt } = useMemo(() => {
		if (activePreset === 'custom' && customRange) {
			return {
				startAt: customRange[0].toISOString(),
				endAt: customRange[1].toISOString(),
			};
		}

		const selectedRange = DATE_RANGES.find((range) => range.key === activePreset);
		if (!selectedRange?.days) {
			return { startAt: undefined, endAt: undefined };
		}

		const date = new Date();
		date.setDate(date.getDate() - selectedRange.days);
		return { startAt: date.toISOString(), endAt: undefined };
	}, [activePreset, customRange]);

	const chartTimeDomain = useMemo(() => {
		if (!startAt) {
			return null;
		}

		const parsedStartAt = Date.parse(startAt);
		const parsedEndAt = endAt ? Date.parse(endAt) : Date.now();
		if (!Number.isFinite(parsedStartAt) || !Number.isFinite(parsedEndAt)) {
			return null;
		}

		return {
			startAt: Math.min(parsedStartAt, parsedEndAt),
			endAt: Math.max(parsedStartAt, parsedEndAt),
		};
	}, [startAt, endAt]);

	const handlePresetClick = useCallback((key: DateRangeKey) => {
		setActivePreset(key);
		setCustomRange(null);
		setDatePickerRange(undefined);
	}, []);

	const handleDateRangeSelect = useCallback(
		(range: DateRange | undefined) => {
			if (datePickerRange?.from && !datePickerRange.to) {
				setDatePickerRange(range);
				if (range?.from && range?.to) {
					setCustomRange([range.from, range.to]);
					setActivePreset('custom');
				}
			}
		},
		[datePickerRange?.from, datePickerRange?.to],
	);

	const handleDayClick = useCallback(
		(date: Date) => {
			if (datePickerRange?.from && !datePickerRange.to) {
				return;
			}
			setDatePickerRange({ from: date });
		},
		[datePickerRange?.from, datePickerRange?.to],
	);

	const categoryOptionsQuery = api.api.app.getProductHistory.useQuery(
		{
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: 'bsrCategory',
			limit: 10_000,
		},
		{
			refetchOnWindowFocus: false,
			staleTime: 60_000,
		},
	);

	const availableCategories = useMemo(() => {
		if (!categoryOptionsQuery.data) {
			return [] as CategoryOption[];
		}

		const categoryMap = new Map<number, string | null>();
		for (const point of categoryOptionsQuery.data.points) {
			if (!Number.isFinite(point.categoryId) || point.categoryId <= 0) {
				continue;
			}

			const name = categoryOptionsQuery.data.categoryNames[String(point.categoryId)] ?? null;
			if (!categoryMap.has(point.categoryId) || name) {
				categoryMap.set(point.categoryId, name);
			}
		}

		return Array.from(categoryMap.entries())
			.sort((left, right) => left[0] - right[0])
			.map(([id, name]) => ({ id, name }));
	}, [categoryOptionsQuery.data]);

	const mainCategoryQuery = api.api.app.getProductHistory.useQuery(
		{
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: 'bsrMain',
			limit: 1,
		},
		{ refetchOnWindowFocus: false, staleTime: Number.POSITIVE_INFINITY },
	);

	const mainCategoryName = useMemo(() => {
		const point = mainCategoryQuery.data?.points[0];
		if (!point) {
			return 'Main Category';
		}
		return mainCategoryQuery.data?.categoryNames[String(point.categoryId)] ?? 'Main Category';
	}, [mainCategoryQuery.data]);

	const mainCategoryId = useMemo(() => {
		const categoryId = mainCategoryQuery.data?.points[0]?.categoryId;
		return Number.isFinite(categoryId) && typeof categoryId === 'number' && categoryId > 0
			? categoryId
			: null;
	}, [mainCategoryQuery.data]);

	const rankSelectOptions = useMemo(() => {
		const categoryOptions = availableCategories
			.filter((category) => category.id !== mainCategoryId)
			.map((category) => ({
				value: `cat:${category.id}`,
				label: category.name ?? `#${category.id.toLocaleString()}`,
			}));

		return [
			{ value: 'bsrMain', label: mainCategoryName },
			...categoryOptions,
		] satisfies SelectOption[];
	}, [availableCategories, mainCategoryId, mainCategoryName]);

	const rankMetric = rankMetricValue.startsWith('cat:') ? 'bsrCategory' : 'bsrMain';
	const rankCategoryId = rankMetricValue.startsWith('cat:')
		? Number(rankMetricValue.slice(4))
		: undefined;

	const rankQueryInput = useMemo(
		() => ({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: rankMetric,
			limit: 5000,
			...(startAt ? { startAt } : {}),
			...(endAt ? { endAt } : {}),
			...(rankMetric === 'bsrCategory' && typeof rankCategoryId === 'number'
				? { categoryId: rankCategoryId }
				: {}),
		}),
		[product.marketplaceId, product.asin, rankMetric, rankCategoryId, startAt, endAt],
	);

	const rankQuery = api.api.app.getProductHistory.useQuery(rankQueryInput, {
		refetchOnWindowFocus: false,
		staleTime: 30_000,
	});

	const priceQueryInput = useMemo(
		() => ({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: 'priceNew' as const,
			limit: 5000,
			...(startAt ? { startAt } : {}),
			...(endAt ? { endAt } : {}),
		}),
		[product.marketplaceId, product.asin, startAt, endAt],
	);

	const priceQuery = api.api.app.getProductHistory.useQuery(priceQueryInput, {
		refetchOnWindowFocus: false,
		staleTime: 30_000,
	});

	const loadMutation = api.api.app.loadProductHistory.useMutation({
		onSuccess: async (data) => {
			toastManager.add({
				type: 'success',
				title: `Synced ${data.pointsStored.toLocaleString()} points from Keepa`,
			});
			await Promise.all([
				rankQuery.refetch(),
				priceQuery.refetch(),
				categoryOptionsQuery.refetch(),
			]);
		},
		onError: (error) => {
			toastManager.add({
				type: 'error',
				title: 'Sync failed',
				description: error.message,
			});
		},
	});

	const triggerKeepaSync = useCallback(() => {
		if (loadMutation.isPending) {
			return;
		}

		loadMutation.mutate({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			days: 365,
		});
	}, [loadMutation, product.marketplaceId, product.asin]);

	const hasCheckedAutoRefreshRef = useRef(false);
	useEffect(() => {
		if (hasCheckedAutoRefreshRef.current || rankQuery.isLoading) {
			return;
		}

		hasCheckedAutoRefreshRef.current = true;
		if (rankQuery.isError) {
			return;
		}

		const latestImportAt = rankQuery.data?.latestImportAt;
		const shouldSync =
			!latestImportAt ||
			!Number.isFinite(Date.parse(latestImportAt)) ||
			Date.now() - Date.parse(latestImportAt) > KEEPA_STALE_REFRESH_MS;

		if (shouldSync) {
			triggerKeepaSync();
		}
	}, [rankQuery.isLoading, rankQuery.isError, rankQuery.data?.latestImportAt, triggerKeepaSync]);

	return {
		activePreset,
		chartTimeDomain,
		customRange,
		datePickerRange,
		handleDayClick,
		handleDateRangeSelect,
		handlePresetClick,
		loadMutation,
		priceQuery,
		rankMetric,
		rankMetricValue,
		rankQuery,
		rankSelectOptions,
		setRankMetricValue,
		setDatePickerRange,
		triggerKeepaSync,
	};
};
