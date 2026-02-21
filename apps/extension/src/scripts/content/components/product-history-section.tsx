import { useId } from "react";
import type { ProductIdentifier } from "@/scripts/types/product";
import { useProductHistory } from "../hooks/use-product-history";
import { ProductHistoryChart } from "./product-history-chart";

export const ProductHistorySection = ({
	compact = false,
	enabled,
	productIdentifier,
}: {
	compact?: boolean;
	enabled: boolean;
	productIdentifier: ProductIdentifier;
}) => {
	const uniqueId = useId();
	const chartId = `rw-history-${uniqueId.replace(/:/g, "")}`;
	const { chartPoints, collecting, error, isLoading, latestImportAt } =
		useProductHistory({
			enabled,
			productIdentifier,
		});

	return (
		<div className="w-full">
			<ProductHistoryChart
				chartId={chartId}
				collecting={collecting}
				compact={compact}
				error={error}
				isLoading={isLoading}
				points={chartPoints}
			/>
			{latestImportAt ? (
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
