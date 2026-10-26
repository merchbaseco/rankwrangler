import { Button } from "@/components/ui/button";
import { useCollectionStatus } from "@/hooks/use-collection-status";
import { formatNumber } from "@/lib/utils";

const WORK_LABELS: Record<string, string> = {
	interactive: "Interactive",
	history: "Product history",
	head: "Keyword checks",
	discovery: "Discovery",
};

export const CollectionStatusPanel = () => {
	const query = useCollectionStatus();
	if (query.isLoading) {
		return (
			<section className="border-border border-t p-3 text-muted-foreground text-sm">
				Loading collection status…
			</section>
		);
	}
	if (!query.data) {
		return (
			<section className="flex items-center justify-between border-border border-t p-3 text-sm">
				<p className="text-muted-foreground">
					Couldn’t load collection status.
				</p>
				<Button onClick={() => query.refetch()} size="sm" variant="ghost">
					Retry
				</Button>
			</section>
		);
	}
	const { keepa, history, keywords, exploration } = query.data;
	const automaticProducts = history.admissions.reduce(
		(sum, row) => sum + row.automaticEligible,
		0,
	);
	const pausedProducts =
		history.admissions.find((row) => row.state === "paused")?.products ?? 0;
	const dueKeywords = keywords.reduce((sum, row) => sum + row.due, 0);
	const readyPasses = exploration.passes.reduce(
		(sum, row) => sum + row.ready,
		0,
	);
	const discoveryAttempts = exploration.yield24h.physical_starts;
	const targets = exploration.scopes.reduce((sum, row) => sum + row.enabled, 0);
	const stats = [
		["Automatic history", formatNumber(automaticProducts)],
		["Awaiting history capacity", formatNumber(pausedProducts)],
		["History overdue", formatNumber(history.overload.overdueCount)],
		["Keyword checks due", formatNumber(dueKeywords)],
		["Exploration ready", formatNumber(readyPasses)],
		["SP-API discovery / 24h", String(discoveryAttempts)],
		["Acquisition targets", formatNumber(targets)],
		[
			"Products mined",
			formatNumber(
				exploration.mining.find((row) => row.stage === "complete")?.products ??
					0,
			),
		],
		["New listings / 24h", formatNumber(exploration.yield24h.new_products)],
		["New Merch / 24h", formatNumber(exploration.yield24h.new_merch)],
	];
	return (
		<section
			aria-label="Collection status"
			className="space-y-3 border-border border-t p-3"
		>
			<div className="flex items-center justify-between gap-3">
				<h3 className="font-medium text-sm">Collection status</h3>
				<span className="text-muted-foreground text-xs">
					{keepa.fresh
						? "Keepa capacity observed"
						: "Keepa capacity awaiting observation"}
				</span>
			</div>
			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
				{stats.map(([label, value]) => (
					<div key={label}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="mt-1 font-mono text-sm">{value}</dd>
					</div>
				))}
			</dl>
			<div className="space-y-1 text-muted-foreground text-xs">
				<p>
					{exploration.capacity
						? `SP-API background: ${exploration.capacity.backgroundRps.toFixed(2)} requests/second · ${(exploration.capacity.backgroundShare * 100).toFixed(0)}% of effective capacity · no daily pilot cap`
						: "SP-API capacity awaiting observation"}
				</p>
				<p>
					Sources:{" "}
					{exploration.sources
						.map(
							(row) => `${SOURCE_LABELS[row.kind] ?? row.kind} ${row.targets}`,
						)
						.join(" · ") || "awaiting candidates"}
					. Source counts can overlap.
				</p>
				{exploration.yield24h.legacy_pages > 0 && (
					<p>
						Yield totals cover {exploration.yield24h.measured_pages} measured
						pages; {exploration.yield24h.legacy_pages} older pages have no yield
						counters.
					</p>
				)}
			</div>
			{exploration.standings.length > 0 && (
				<div className="space-y-1 text-xs">
					<p className="font-medium">Keyword collection</p>
					{exploration.standings.slice(0, 5).map((row) => (
						<p key={row.keyword} className="text-muted-foreground">
							{row.keyword} · {row.tracking} / {row.tier} · score{" "}
							{row.score ?? "unrated"} · ~{row.interval_days}{" "}
							{row.interval_days === 1 ? "day" : "days"} between checks
						</p>
					))}
				</div>
			)}
			{history.overload.newAdmissionsPaused && (
				<p className="text-destructive text-xs">
					New history admissions are paused while overdue work catches up.
				</p>
			)}
			<div className="space-y-1 text-muted-foreground text-xs">
				<p>
					Keepa:{" "}
					{keepa.estimatedTokensLeft === null
						? "unknown balance"
						: `${formatNumber(keepa.estimatedTokensLeft)} estimated tokens`}
					{keepa.refillRate === null ? "" : ` · ${keepa.refillRate}/min refill`}
					{keepa.interactiveFloor === null
						? ""
						: ` · ${keepa.interactiveFloor} reserved floor`}
				</p>
				{keepa.rollingHour.length > 0 && (
					<p>
						Last hour:{" "}
						{keepa.rollingHour
							.map(
								(row) =>
									`${WORK_LABELS[row.workClass] ?? row.workClass} ${row.actualTokens} used${row.reservedUnknownTokens > 0 ? ` + ${row.reservedUnknownTokens} held` : ""}`,
							)
							.join(" · ")}
					</p>
				)}
			</div>
		</section>
	);
};

const SOURCE_LABELS: Record<string, string> = {
	adsRecommendation: "ASIN keyword recommendations",
	interest: "Research interest",
	brandAnalytics: "Buyer demand",
	catalogFacet: "Catalog topics",
	catalogBrand: "Catalog brands",
	legacy: "Imported",
};
