import { normalizeHistoryPoints } from "@rankwrangler/history-chart/history-chart-utils";
import type {
	HistoryPoint,
	HistoryQueryResult,
} from "@/components/dashboard/product-history-panel/types";

export const buildPoints = ({
	query,
}: {
	query: HistoryQueryResult;
}): HistoryPoint[] => {
	if (!query.data) {
		return [];
	}

	return normalizeHistoryPoints(query.data.points);
};
