import {
	CircleCheck,
	CircleMinus,
	CirclePause,
	Clock3,
	FlaskConical,
	GraduationCap,
	LoaderCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DirectoryRow } from "./keyword-directory-cache";

const stages = {
	graduated: { label: "Graduated", icon: GraduationCap, variant: "outline" },
	trial: { label: "Trial", icon: FlaskConical, variant: "outline" },
	dropped: { label: "Dropped", icon: CircleMinus, variant: "secondary" },
	untracked: { label: "Untracked", icon: CirclePause, variant: "secondary" },
} as const;
const freshness = {
	live: { label: "Live", icon: CircleCheck, variant: "success" },
	needsSync: { label: "Needs sync", icon: Clock3, variant: "warning" },
	syncing: { label: "Syncing", icon: LoaderCircle, variant: "info" },
} as const;
// A trial's freshness is its qualification check, so it reads as check progress.
const trialLabels = { needsSync: "Awaiting check", syncing: "Checking" } as const;

export const KeywordStageBadge = ({
	stage,
	title,
}: {
	stage: DirectoryRow["stage"];
	title?: string;
}) => {
	const { icon: Icon, label, variant } = stages[stage];
	return (
		<Badge variant={variant} title={title}>
			<Icon aria-hidden="true" className="size-3" />
			{label}
		</Badge>
	);
};

export const KeywordFreshnessBadge = ({
	stage,
	freshness: value,
	title,
}: {
	stage: DirectoryRow["stage"];
	freshness: NonNullable<DirectoryRow["freshness"]>;
	title?: string;
}) => {
	const { icon: Icon, label, variant } = freshness[value];
	return (
		<Badge variant={variant} title={title}>
			<Icon
				aria-hidden="true"
				className={`size-3 ${value === "syncing" ? "animate-spin motion-reduce:animate-none" : ""}`}
			/>
			{stage === "trial" && value !== "live" ? trialLabels[value] : label}
		</Badge>
	);
};
