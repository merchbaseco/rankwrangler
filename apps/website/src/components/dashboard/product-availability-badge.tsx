import { Badge } from "@/components/ui/badge";

export const ProductAvailabilityBadge = ({
	isUnavailable,
}: {
	isUnavailable: boolean;
}) =>
	isUnavailable ? (
		<Badge
			className="rounded-sm px-1 py-0 text-[10px] leading-tight"
			variant="error"
		>
			Unavailable
		</Badge>
	) : null;
