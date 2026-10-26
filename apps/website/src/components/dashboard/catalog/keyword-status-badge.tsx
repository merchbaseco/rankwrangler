import { CircleCheck, CirclePause, Clock3, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const statuses = {
	queued: { label: "Queued", icon: Clock3, variant: "warning" },
	scanning: { label: "Scanning", icon: LoaderCircle, variant: "info" },
	upToDate: { label: "Up to date", icon: CircleCheck, variant: "success" },
	untracked: { label: "Untracked", icon: CirclePause, variant: "secondary" },
} as const;

export const KeywordStatusBadge = ({
	status,
	reason,
}: {
	status: keyof typeof statuses;
	reason?: string;
}) => {
	const { icon: Icon, label, variant } = statuses[status];
	return (
		<Badge variant={variant} title={reason}>
			<Icon
				aria-hidden="true"
				className={`size-3 ${status === "scanning" ? "animate-spin motion-reduce:animate-none" : ""}`}
			/>
			{label}
		</Badge>
	);
};
