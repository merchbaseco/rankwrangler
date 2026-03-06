export const DashboardFooter = ({
	activeFilterCount,
	hasMore,
	productCount,
}: {
	activeFilterCount: number;
	hasMore: boolean;
	productCount: number;
}) => (
	<div className="border-t border-border bg-card px-4 py-2">
		<div className="text-muted-foreground flex items-center justify-between text-xs font-mono">
			<span>
				{activeFilterCount > 0
					? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} active`
					: "No filters applied"}
			</span>
			<span>
				{productCount > 0
					? hasMore
						? `${productCount} products loaded / more available`
						: `${productCount} products loaded`
					: null}
			</span>
			<span>{`RankWrangler v${import.meta.env.VITE_APP_VERSION}`}</span>
		</div>
	</div>
);
