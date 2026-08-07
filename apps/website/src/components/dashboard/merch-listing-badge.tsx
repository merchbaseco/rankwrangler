import { Badge } from "@/components/ui/badge";

export const MerchListingBadge = ({
	className,
	size,
	value,
}: {
	className?: string;
	size?: "default" | "sm" | "lg";
	value: boolean | null;
}) => (
	<Badge
		className={className}
		size={size}
		variant={value === true ? "secondary" : "outline"}
	>
		{value === true ? "Merch" : value === false ? "Not Merch" : "Unknown"}
	</Badge>
);
