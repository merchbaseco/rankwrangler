import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getProductHistory } from "@/scripts/api/get-product-history";
import type {
	ProductHistory,
	ProductIdentifier,
} from "@/scripts/types/product";

export interface ChartPoint {
	timestamp: number;
	value: number;
}

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

	return history.points
		.filter(
			(point) =>
				!point.isMissing &&
				typeof point.value === "number" &&
				Number.isFinite(point.value)
		)
		.map((point) => ({
			timestamp: Date.parse(point.observedAt),
			value: point.value as number,
		}))
		.filter((point) => Number.isFinite(point.timestamp))
		.sort((left, right) => left.timestamp - right.timestamp);
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
