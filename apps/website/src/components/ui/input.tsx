"use client";

import { Input as InputPrimitive } from "@base-ui-components/react/input";
import type * as React from "react";
import { cn } from "../../lib/utils";

type InputProps = Omit<
	InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
	"size"
> & {
	size?: "sm" | "default" | "lg" | number;
	unstyled?: boolean;
};

function Input({
	className,
	size = "default",
	unstyled = false,
	...props
}: InputProps) {
	return (
		<span
			className={
				cn(
					!unstyled &&
						"relative inline-flex w-full rounded-md border border-input bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[:disabled]:opacity-50",
					className,
				) || undefined
			}
			data-size={size}
			data-slot="input-control"
		>
			<InputPrimitive
				className={cn(
					"file:text-foreground placeholder:text-muted-foreground w-full min-w-0 rounded-[inherit] bg-transparent outline-none file:me-2 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed",
					size === "sm" && "h-8 px-2.5 py-1 text-xs",
					size === "default" && "h-9 px-3 py-1.5 text-sm",
					size === "lg" && "h-10 px-3 py-2 text-sm",
					props.type === "search" &&
						"[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
				)}
				data-slot="input"
				size={typeof size === "number" ? size : undefined}
				{...props}
			/>
		</span>
	);
}

export { Input };
