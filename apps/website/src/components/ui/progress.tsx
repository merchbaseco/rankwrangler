"use client";

import { Progress as ProgressPrimitive } from "@base-ui-components/react/progress";
import { cn } from "../../lib/utils";

function Progress({
	className,
	children,
	...props
}: ProgressPrimitive.Root.Props) {
	return (
		<ProgressPrimitive.Root
			className={cn("flex w-full flex-col gap-2", className)}
			data-slot="progress"
			{...props}
		>
			{children ? (
				children
			) : (
				<ProgressTrack>
					<ProgressIndicator />
				</ProgressTrack>
			)}
		</ProgressPrimitive.Root>
	);
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
	return (
		<ProgressPrimitive.Track
			className={cn(
				"bg-primary/20 relative block h-2 w-full overflow-hidden rounded-full",
				className,
			)}
			data-slot="progress-track"
			{...props}
		/>
	);
}

function ProgressIndicator({
	className,
	...props
}: ProgressPrimitive.Indicator.Props) {
	return (
		<ProgressPrimitive.Indicator
			className={cn("bg-primary h-full transition-all", className)}
			data-slot="progress-indicator"
			{...props}
		/>
	);
}

export { Progress };
