import { ImageOff, LoaderCircle } from "lucide-react";
import {
	Tooltip,
	TooltipPopup,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export const PendingCatalogProductThumbnail = () => (
	<Tooltip delay={0}>
		<TooltipTrigger
			aria-label="Loading Amazon listing data"
			className="flex h-12 w-10 cursor-wait items-center justify-center rounded-sm border border-border bg-muted"
			render={<div />}
		>
			<LoaderCircle className="size-4 animate-spin text-muted-foreground" />
		</TooltipTrigger>
		<TooltipPopup>Loading Amazon listing data…</TooltipPopup>
	</Tooltip>
);

export const AvailableCatalogProductThumbnail = ({
	asin,
	title,
	url,
}: {
	asin: string;
	title: string | null;
	url: string;
}) => (
	<div className="flex h-12 w-10 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted">
		<img
			alt={title ?? asin}
			className="h-full w-auto max-w-none"
			src={url}
		/>
	</div>
);

export const UnavailableCatalogProductThumbnail = () => (
	<Tooltip delay={0}>
		<TooltipTrigger
			aria-label="Amazon listing has no thumbnail"
			className="flex h-12 w-10 items-center justify-center rounded-sm border border-border bg-muted"
			render={<div />}
		>
			<ImageOff className="size-4 text-muted-foreground/70" />
		</TooltipTrigger>
		<TooltipPopup>Amazon listing has no thumbnail</TooltipPopup>
	</Tooltip>
);
