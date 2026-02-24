import { useId } from "react";
import type { ChartPoint } from "../hooks/use-product-history";
import { ProductHistoryChart } from "./product-history-chart";

export const ProductHistorySection = ({
	chartPoints,
	collecting,
	compact = false,
	error,
	isLoading,
	latestImportAt,
	showChartHeader = true,
	showLastSync = true,
}: {
	chartPoints: ChartPoint[];
	collecting: boolean;
	compact?: boolean;
	error: string | null;
	isLoading: boolean;
	latestImportAt: string | null;
	showChartHeader?: boolean;
	showLastSync?: boolean;
}) => {
	const uniqueId = useId();
	const chartId = `rw-history-${uniqueId.replace(/:/g, "")}`;

	return (
		<div className="w-full">
			<ProductHistoryChart
				chartId={chartId}
				collecting={collecting}
				compact={compact}
				error={error}
				isLoading={isLoading}
				points={chartPoints}
				showHeader={showChartHeader}
			/>
			{showLastSync && latestImportAt ? (
				<p className="mt-1 text-[10px] text-gray-500">
					Last sync: {formatLastSync(latestImportAt)}
				</p>
			) : null}
		</div>
	);
};

const formatLastSync = (timestamp: string) => {
	const parsed = Date.parse(timestamp);
	if (!Number.isFinite(parsed)) {
		return "unknown";
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(parsed));
};
