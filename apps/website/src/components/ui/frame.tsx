import type * as React from "react";
import { cn } from "../../lib/utils";

function Frame({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="frame"
			className={cn("overflow-hidden rounded-sm border border-border bg-card", className)}
			{...props}
		/>
	);
}

function FrameFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="frame-footer"
			className={cn("border-t border-border bg-muted/30 px-3 py-2", className)}
			{...props}
		/>
	);
}

export { Frame, FrameFooter };
