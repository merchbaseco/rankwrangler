import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ProductAvailabilityBadge = ({
	isUnavailable,
	className,
}: {
	isUnavailable: boolean;
	className?: string;
}) =>
	isUnavailable ? (
		<Badge
			className={cn("rounded-sm font-mono text-xs", className)}
			variant="error"
		>
			Unavailable
		</Badge>
	) : null;
