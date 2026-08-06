import { useMemo } from "react";
import type { CategoryOption } from "@/components/dashboard/product-history-panel/types";
import { api } from "@/lib/trpc";

export const useProductHistoryPanelCategories = ({
	asin,
	marketplaceId,
}: {
	asin: string;
	marketplaceId: string;
}) => {
	const categoryOptionsInput = useMemo(
		() => ({
			marketplaceId,
			asin,
			metric: "bsrCategory" as const,
			limit: 10_000,
			refresh: "none" as const,
		}),
		[asin, marketplaceId],
	);
	const categoryOptionsQuery = api.api.app.getProductHistory.useQuery(
		categoryOptionsInput,
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

			const name =
				categoryOptionsQuery.data.categoryNames[String(point.categoryId)] ??
				null;
			if (!categoryMap.has(point.categoryId) || name) {
				categoryMap.set(point.categoryId, name);
			}
		}

		return Array.from(categoryMap.entries())
			.sort((left, right) => left[0] - right[0])
			.map(([id, name]) => ({ id, name }));
	}, [categoryOptionsQuery.data]);

	const mainCategoryInput = useMemo(
		() => ({
			marketplaceId,
			asin,
			metric: "bsrMain" as const,
			limit: 1,
			refresh: "none" as const,
		}),
		[asin, marketplaceId],
	);
	const mainCategoryQuery = api.api.app.getProductHistory.useQuery(
		mainCategoryInput,
		{ refetchOnWindowFocus: false, staleTime: Number.POSITIVE_INFINITY },
	);

	const mainCategoryName = useMemo(() => {
		const point = mainCategoryQuery.data?.points[0];
		if (!point) {
			return "Main Category";
		}
		return (
			mainCategoryQuery.data?.categoryNames[String(point.categoryId)] ??
			"Main Category"
		);
	}, [mainCategoryQuery.data]);

	const mainCategoryId = useMemo(() => {
		const categoryId = mainCategoryQuery.data?.points[0]?.categoryId;
		return Number.isFinite(categoryId) &&
			typeof categoryId === "number" &&
			categoryId > 0
			? categoryId
			: null;
	}, [mainCategoryQuery.data]);

	return {
		availableCategories,
		categoryOptionsInput,
		mainCategoryId,
		mainCategoryInput,
		mainCategoryName,
	};
};
