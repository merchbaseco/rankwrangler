import {
	AMAZON_US_TIME_ZONE,
	useHistoryRangeSelection,
} from "@rankwrangler/history-chart/history-chart-range";
import { useCallback, useMemo, useState } from "react";
import { formatUsd } from "@/components/dashboard/product-history-panel/format-usd";
import { isKeepaSyncStale as getIsKeepaSyncStale } from "@/components/dashboard/product-history-panel/keepa-sync-state";
import type {
	ProductHistoryPanelProduct,
	SelectOption,
} from "@/components/dashboard/product-history-panel/types";
import { useKeepaAutoSync } from "@/components/dashboard/product-history-panel/use-keepa-auto-sync";
import { useProductHistoryLoad } from "@/components/dashboard/product-history-panel/use-product-history-load";
import { useProductHistoryPanelCategories } from "@/components/dashboard/product-history-panel/use-product-history-panel-categories";
import { useProductHistoryPanelProduct } from "@/components/dashboard/product-history-panel/use-product-history-panel-product";
import { toastManager } from "@/components/ui/toast";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { api } from "@/lib/trpc";

export const useProductHistoryPanelData = ({
	product,
}: {
	product: ProductHistoryPanelProduct;
}) => {
	const {
		product: resolvedProduct,
		isProductRefreshing,
		productRefreshError,
		triggerProductRefresh,
	} = useProductHistoryPanelProduct({ product });
	const { isAdmin } = useAdminAccess();
	const utils = api.useUtils();
	const [rankMetricValue, setRankMetricValue] = useState<string>("bsrMain");
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
		defaultRange: "1y",
		customRangeTimeZone: AMAZON_US_TIME_ZONE,
	});
	const startAt = queryRange.startAt;
	const endAt = queryRange.endAt;
	const {
		availableCategories,
		categoryOptionsInput,
		mainCategoryId,
		mainCategoryInput,
		mainCategoryName,
	} = useProductHistoryPanelCategories({
		asin: product.asin,
		marketplaceId: product.marketplaceId,
	});

	const rankSelectOptions = useMemo(() => {
		const categoryOptions = availableCategories
			.filter((category) => category.id !== mainCategoryId)
			.map((category) => ({
				value: `cat:${category.id}`,
				label: category.name ?? `#${category.id.toLocaleString()}`,
			}));

		return [
			{ value: "bsrMain", label: mainCategoryName },
			...categoryOptions,
		] satisfies SelectOption[];
	}, [availableCategories, mainCategoryId, mainCategoryName]);
	const rankMetric = rankMetricValue.startsWith("cat:")
		? "bsrCategory"
		: "bsrMain";
	const rankCategoryId = rankMetricValue.startsWith("cat:")
		? Number(rankMetricValue.slice(4))
		: undefined;
	const rankQueryInput = useMemo(
		() => ({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: rankMetric,
			limit: 5000,
			refresh: "none" as const,
			...(startAt ? { startAt } : {}),
			...(endAt ? { endAt } : {}),
			...(rankMetric === "bsrCategory" && typeof rankCategoryId === "number"
				? { categoryId: rankCategoryId }
				: {}),
		}),
		[
			product.marketplaceId,
			product.asin,
			rankMetric,
			rankCategoryId,
			startAt,
			endAt,
		],
	);

	const rankQuery = api.api.app.getProductHistory.useQuery(rankQueryInput, {
		refetchOnWindowFocus: false,
		staleTime: 30_000,
	});

	const priceQueryInput = useMemo(
		() => ({
			marketplaceId: product.marketplaceId,
			asin: product.asin,
			metric: "priceNew" as const,
			limit: 5000,
			refresh: "none" as const,
			...(startAt ? { startAt } : {}),
			...(endAt ? { endAt } : {}),
		}),
		[product.marketplaceId, product.asin, startAt, endAt],
	);

	const priceQuery = api.api.app.getProductHistory.useQuery(priceQueryInput, {
		refetchOnWindowFocus: false,
		staleTime: 30_000,
	});

	const invalidateProductHistory = useCallback(
		async () =>
			await Promise.all([
				utils.api.app.getProductHistory.invalidate(rankQueryInput),
				utils.api.app.getProductHistory.invalidate(priceQueryInput),
				utils.api.app.getProductHistory.invalidate(categoryOptionsInput),
				utils.api.app.getProductHistory.invalidate(mainCategoryInput),
			]),
		[
			categoryOptionsInput,
			mainCategoryInput,
			priceQueryInput,
			rankQueryInput,
			utils,
		],
	);
	const loadMutation = useProductHistoryLoad({
		marketplaceId: product.marketplaceId,
		asin: product.asin,
		observedOperation: rankQuery.data?.operation ?? null,
		invalidateHistory: invalidateProductHistory,
	});

	const fetchFacetsMutation = api.api.app.classifyProductFacets.useMutation({
		onSuccess: async (data) => {
			if (data.status === "already_ready") {
				toastManager.add({
					type: "info",
					title: "Facets already assigned",
					description: `${product.asin} already has facets.`,
				});
			} else {
				toastManager.add({
					type: "success",
					title: "Facets classified",
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
				type: "error",
				title: "Facet classification failed",
				description: error.message,
			});
		},
	});

	const triggerKeepaSync = useCallback(() => {
		if (loadMutation.isSyncing) {
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
		isProductRefreshing,
		keepaLastSyncAt,
		loadMutation,
		priceQuery,
		rankMetric,
		rankMetricValue,
		rankQuery,
		rankSelectOptions,
		product: resolvedProduct,
		productRefreshError,
		setRankMetricValue,
		canFetchFacets: isAdmin,
		fetchFacetsMutation,
		triggerFacetClassification,
		triggerKeepaSync,
		triggerProductRefresh,
	};
};
