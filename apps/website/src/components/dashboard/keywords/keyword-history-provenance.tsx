export type KeywordHistoryProvenancePoint = {
	observedDate: string;
	trigger: "requested" | "automatic";
};

export const KeywordHistoryProvenance = ({
	points,
}: {
	points: KeywordHistoryProvenancePoint[];
}) => {
	if (points.length === 0) {
		return null;
	}

	return (
		<details className="border-t border-border bg-card px-5 py-2 text-xs">
			<summary className="cursor-pointer font-medium text-foreground">
				Refresh provenance ({points.length})
			</summary>
			<ul aria-label="Keyword history refresh provenance" className="mt-2 space-y-1">
				{points.map((point) => (
					<li className="flex items-center justify-between gap-3 text-muted-foreground" key={point.observedDate}>
						<time dateTime={point.observedDate}>{point.observedDate}</time>
						<span className="font-medium text-foreground">
							{point.trigger === "requested" ? "Requested refresh" : "Automatic refresh"}
						</span>
					</li>
				))}
			</ul>
		</details>
	);
};
