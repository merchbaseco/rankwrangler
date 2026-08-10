import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const ProductListingStatusBadge = ({
	amazonListingStatus,
	className,
}: {
	amazonListingStatus: "active" | "deleted";
	className?: string;
}) =>
	amazonListingStatus === "deleted" ? (
		<Badge
			className={cn("rounded-sm font-mono text-xs", className)}
			variant="error"
		>
			Deleted from Amazon
		</Badge>
	) : null;
