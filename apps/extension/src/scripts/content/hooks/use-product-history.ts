import type { HistoryChartPoint } from "@rankwrangler/history-chart/history-chart-types";
import { normalizeHistoryPoints } from "@rankwrangler/history-chart/history-chart-utils";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getProductHistory } from "@/scripts/api/get-product-history";
import type {
	ProductHistory,
	ProductIdentifier,
} from "@/scripts/types/product";

export type ChartPoint = HistoryChartPoint;

export const useProductHistory = ({
	enabled,
	productIdentifier,
}: {
	enabled: boolean;
	productIdentifier: ProductIdentifier;
}) => {
	const query = useQuery({
		queryKey: [
			"productHistory",
			productIdentifier.marketplaceId,
			productIdentifier.asin,
		],
		queryFn: async () => {
			const history = await getProductHistory(productIdentifier);
			if (!history) {
				throw new Error("Unable to load BSR history.");
			}
			return history;
		},
		enabled,
		retry: 1,
		staleTime: 0,
		refetchInterval: enabled ? 5000 : false,
		refetchOnWindowFocus: false,
	});

	const chartPoints = useMemo(() => buildChartPoints(query.data), [query.data]);

	const isCollecting =
		Boolean(enabled) &&
		!query.isLoading &&
		!query.isError &&
		(query.data?.collecting ?? false);
	const error = resolveHistoryError(query.isError, query.error);

	return {
		chartPoints,
		collecting: isCollecting,
		error,
		isLoading: query.isLoading,
		latestImportAt: query.data?.latestImportAt ?? null,
		refetch: query.refetch,
	};
};

const buildChartPoints = (
	history: ProductHistory | undefined
): ChartPoint[] => {
	if (!history) {
		return [];
	}

	return normalizeHistoryPoints(history.points);
};

const resolveHistoryError = (
	isError: boolean,
	error: unknown
): string | null => {
	if (!isError) {
		return null;
	}

	if (error instanceof Error) {
		return error.message;
	}

	return "Unable to load BSR history.";
};
