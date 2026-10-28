import { TableCell, TableRow } from "@/components/ui/table";
import type { DirectoryRow } from "./keyword-directory-cache";
import { KeywordFreshnessBadge, KeywordStageBadge } from "./keyword-status-badge";

const sourceLabels: Record<string, string> = {
	interest: "User search",
	brandAnalytics: "Brand Analytics",
	adsRecommendation: "Amazon Ads",
	autocomplete: "Autocomplete",
	legacy: "Imported",
};
const stageNotes: Partial<Record<DirectoryRow["stage"], string>> = {
	dropped: "Not enough Merch on page 1",
	untracked: "Not scheduled",
};

export const KeywordDirectoryRow = ({ item }: { item: DirectoryRow }) => {
	const sources =
		item.sources.map((source) => sourceLabels[source] ?? source).join(", ") ||
		"Imported";
	const stageNote = stageNotes[item.stage];
	return (
		<TableRow className="h-10">
			<TableCell className="truncate font-medium" title={item.term}>
				{item.term}
			</TableCell>
			<TableCell className="truncate text-muted-foreground" title={sources}>
				{sources}
			</TableCell>
			<TableCell>
				<div className="flex min-w-0 items-center gap-2">
					<KeywordStageBadge stage={item.stage} title={stageNote} />
					{stageNote ? <Note text={stageNote} /> : null}
				</div>
			</TableCell>
			<TableCell>
				{item.freshness ? (
					<div className="flex min-w-0 items-center gap-2">
						<KeywordFreshnessBadge
							stage={item.stage}
							freshness={item.freshness}
							title={item.retryScheduled ? "Retry scheduled" : undefined}
						/>
						{item.retryScheduled ? <Note text="Retry scheduled" /> : null}
					</div>
				) : (
					<span className="text-muted-foreground">—</span>
				)}
			</TableCell>
			<TableCell className="font-mono tabular-nums">
				{item.merch} / {item.products}
			</TableCell>
			<TableCell
				className="truncate"
				title={
					item.searchFrequencyRank === null
						? undefined
						: `Brand Analytics search frequency rank ${item.searchFrequencyRank.toLocaleString()}`
				}
			>
				{item.heat}
				{item.score === null ? "" : ` · ${Math.round(item.score)}`}
				{item.searchFrequencyRank === null
					? ""
					: ` · #${item.searchFrequencyRank.toLocaleString()}`}
			</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground">
				{date(item.lastCheckedAt)}
			</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground">
				{item.intervalDays === null ? "—" : `~${Math.round(item.intervalDays)}d`}{" "}
				· {date(item.nextCheckAt)}
			</TableCell>
		</TableRow>
	);
};

const Note = ({ text }: { text: string }) => (
	<span className="truncate text-xs text-muted-foreground" title={text}>
		{text}
	</span>
);

const date = (value: string | null) =>
	value
		? new Date(value).toLocaleString(undefined, {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})
		: "—";
