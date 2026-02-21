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

export { Frame };
