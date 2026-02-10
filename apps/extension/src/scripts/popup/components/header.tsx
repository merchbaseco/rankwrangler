export const Header = () => {
	return (
		<div className="flex gap-3 pb-8">
			<div className="shrink-0">
				<div className="aspect-square rounded-lg border border-orange-200 bg-gradient-to-b from-orange-100 to-orange-200 p-[3px] shadow-sm">
					<img
						alt="RankWrangler"
						className="size-8 object-contain"
						height={32}
						src="images/icon.png"
						width={32}
					/>
				</div>
			</div>
			<div>
				<div className="-mt-0.5 font-bold text-base text-primary tracking-tighter">
					Rank Wrangler
				</div>
				<div className="text-secondary text-xs tracking-tight">
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
