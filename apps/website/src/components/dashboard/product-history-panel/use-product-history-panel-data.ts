import {
    AMAZON_US_TIME_ZONE,
    useHistoryRangeSelection,
} from '@rankwrangler/history-chart/history-chart-range';
import { useCallback, useMemo, useState } from 'react';
import {
    isKeepaSyncStale as getIsKeepaSyncStale,
} from '@/components/dashboard/product-history-panel/keepa-sync-state';
import type {
	CategoryOption,
	ProductHistoryPanelProduct,
	SelectOption,
} from '@/components/dashboard/product-history-panel/types';
import { useKeepaAutoSync } from '@/components/dashboard/product-history-panel/use-keepa-auto-sync';
import { useProductHistoryPanelProduct } from '@/components/dashboard/product-history-panel/use-product-history-panel-product';
import { toastManager } from '@/components/ui/toast';
import { useAdminAccess } from '@/hooks/use-admin-access';
import { api } from '@/lib/trpc';

export const useProductHistoryPanelData = ({
	product,
}: {
	product: ProductHistoryPanelProduct;
}) => {
	const resolvedProduct = useProductHistoryPanelProduct({ product });
	const { isAdmin } = useAdminAccess();
	const utils = api.useUtils();
	const [rankMetricValue, setRankMetricValue] = useState<string>('bsrMain');
	const {
		activeRange: activePreset,
		chartTimeDomain,
		customRange,
		datePickerRange,
		handleDayClick,
		handleDateRangeSelect,
		handlePresetClick,
		queryRange,
	} = useHistoryRangeSelection({
		defaultRange: '1y',
		customRangeTimeZone: AMAZON_US_TIME_ZONE,
	});
	const startAt = queryRange.startAt;
	const endAt = queryRange.endAt;

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

	const fetchFacetsMutation = api.api.app.classifyProductFacets.useMutation({
		onSuccess: async (data) => {
			if (data.status === 'already_ready') {
				toastManager.add({
					type: 'info',
					title: 'Facets already assigned',
					description: `${product.asin} already has facets.`,
				});
			} else {
				toastManager.add({
					type: 'success',
					title: 'Facets classified',
					description: `${product.asin} • cost ${formatUsd(data.costUsd)}`,
				});
			}

			await Promise.all([
				utils.api.app.recentProducts.invalidate(),
				utils.api.app.getProductFacets.invalidate({
					marketplaceId: product.marketplaceId,
					asin: product.asin,
				}),
			]);
		},
		onError: (error) => {
			toastManager.add({
				type: 'error',
				title: 'Facet classification failed',
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

	const triggerFacetClassification = useCallback(() => {
		if (!isAdmin || fetchFacetsMutation.isPending) {
			return;
		}

		fetchFacetsMutation.mutate({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
		});
	}, [isAdmin, fetchFacetsMutation, product.marketplaceId, product.asin]);

	const keepaLastSyncAt = rankQuery.data?.latestImportAt ?? null;
	const isKeepaSyncStale = getIsKeepaSyncStale({ keepaLastSyncAt });

	useKeepaAutoSync({
		enabled: Boolean(product.marketplaceId && product.asin),
		isKeepaSyncStale,
		isRankQueryError: rankQuery.isError,
		isRankQueryLoading: rankQuery.isLoading,
		triggerKeepaSync,
	});

	return {
		activePreset,
		chartTimeDomain,
		customRange,
		datePickerRange,
		handleDayClick,
		handleDateRangeSelect,
		handlePresetClick,
		isKeepaSyncStale,
		keepaLastSyncAt,
		loadMutation,
		priceQuery,
		rankMetric,
		rankMetricValue,
		rankQuery,
		rankSelectOptions,
		product: resolvedProduct,
		setRankMetricValue,
		canFetchFacets: isAdmin,
		fetchFacetsMutation,
		triggerFacetClassification,
		triggerKeepaSync,
	};
};

const formatUsd = (value: number) => {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 6,
	}).format(value);
};
