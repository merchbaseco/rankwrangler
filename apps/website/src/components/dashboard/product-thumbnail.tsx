import { ImageOff, LoaderCircle } from "lucide-react";
import {
	Tooltip,
	TooltipPopup,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ProductThumbnail =
	| { status: "pending" }
	| { status: "available"; url: string }
	| { status: "unavailable" };

export const getProductThumbnailUrl = (thumbnail: ProductThumbnail) =>
	thumbnail.status === "available" ? thumbnail.url : null;

export const ProductThumbnail = ({
	asin,
	className,
	thumbnail,
	title,
}: {
	asin: string;
	className?: string;
	thumbnail: ProductThumbnail;
	title: string | null;
}) => {
	if (thumbnail.status === "available") {
		return (
			<div
				className={cn(
					"flex w-8 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted",
					className,
				)}
				style={{ aspectRatio: "4/5" }}
			>
				<img
					alt={title ?? asin}
					className="h-full w-auto max-w-none"
					src={thumbnail.url}
				/>
			</div>
		);
	}

	return (
		<Tooltip delay={0}>
			<TooltipTrigger
				aria-label={
					thumbnail.status === "pending"
						? "Loading product thumbnail"
						: "No product thumbnail available"
				}
				className={cn(
					"flex w-8 items-center justify-center rounded-sm border border-border bg-muted",
					className,
				)}
				style={{ aspectRatio: "4/5" }}
				render={<div />}
			>
				{thumbnail.status === "pending" ? (
					<LoaderCircle className="size-4 animate-spin text-muted-foreground" />
				) : (
					<ImageOff className="size-4 text-muted-foreground/70" />
				)}
			</TooltipTrigger>
			<TooltipPopup>
				{thumbnail.status === "pending"
					? "Loading product thumbnail…"
					: "No product thumbnail available"}
			</TooltipPopup>
		</Tooltip>
	);
};
