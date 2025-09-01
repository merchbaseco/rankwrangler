export const Header = () => {
	return (
		<div className="pb-8 flex gap-3">
			<div className="shrink-0">
				<div className="p-[3px] bg-gradient-to-b from-orange-100 to-orange-200 rounded-lg border border-orange-200 shadow-sm aspect-square">
					<img
						src="images/icon.png"
						alt="RankWrangler"
						className="size-8 object-contain"
					/>
				</div>
			</div>
			<div>
				<div className="text-base font-bold text-primary tracking-tighter -mt-0.5">
					Rank Wrangler
				</div>
				<div className="text-xs text-secondary tracking-tight">
					{(() => {
						const taglines = [
							"Tame the Amazon Jungle",
							"Wrangle those BSRs!",
							"Your Shortcut to BSR Gold",
							"No Lasso Required",
						];
						return taglines[Math.floor(Math.random() * taglines.length)];
					})()}
				</div>
			</div>
		</div>
	);
};
