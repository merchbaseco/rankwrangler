import type { DirectoryInput } from "./keyword-directory-cache";
import { KeywordDirectoryFilter } from "./keyword-directory-filter";

export type Stage = NonNullable<DirectoryInput["stage"]>;
export type Freshness = NonNullable<DirectoryInput["freshness"]>;
export type Heat = NonNullable<DirectoryInput["heat"]>;
type StageCounts = Record<Exclude<Stage, "all">, number>;

const stageLabels: Record<Stage, string> = {
	graduated: "Graduated",
	trial: "Trial",
	dropped: "Dropped",
	untracked: "Untracked",
	all: "All keywords",
};
const freshnessLabels: Record<Freshness, string> = {
	all: "Any freshness",
	live: "Live",
	needsSync: "Needs sync",
	syncing: "Syncing",
};
const trialFreshnessLabels: Record<Freshness, string> = {
	all: "Any progress",
	live: "Live",
	needsSync: "Awaiting check",
	syncing: "Checking",
};
const heats = ["all", "hot", "warm", "cold", "unrated"] as const;

export const KeywordDirectorySidebar = ({
	stage,
	freshness,
	heat,
	counts,
	onStage,
	onFreshness,
	onHeat,
}: {
	stage: Stage;
	freshness: Freshness;
	heat: Heat;
	counts: StageCounts | undefined;
	onStage: (stage: Stage) => void;
	onFreshness: (freshness: Freshness) => void;
	onHeat: (heat: Heat) => void;
}) => {
	// Untracked keywords are rare leftovers; offer the filter only while some exist.
	const stages: Stage[] = ["graduated", "trial", "dropped"];
	if (counts?.untracked || stage === "untracked") stages.push("untracked");
	stages.push("all");
	return (
		<aside className="w-48 shrink-0 overflow-y-auto border-r border-border bg-card text-xs">
			<KeywordDirectoryFilter
				title="Stage"
				values={stages}
				labels={stageLabels}
				counts={counts && { ...counts, all: total(counts) }}
				selected={stage}
				onSelect={onStage}
			/>
			{stage === "graduated" || stage === "trial" ? (
				<KeywordDirectoryFilter
					title={stage === "trial" ? "Check" : "Freshness"}
					values={
						stage === "trial"
							? (["all", "needsSync", "syncing"] as const)
							: (["all", "live", "needsSync", "syncing"] as const)
					}
					labels={stage === "trial" ? trialFreshnessLabels : freshnessLabels}
					selected={freshness}
					onSelect={onFreshness}
				/>
			) : null}
			<KeywordDirectoryFilter
				title="Popularity"
				values={heats}
				selected={heat}
				onSelect={onHeat}
			/>
		</aside>
	);
};

const total = (counts: StageCounts) =>
	counts.graduated + counts.trial + counts.dropped + counts.untracked;
