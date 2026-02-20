import { mergeProps } from "@base-ui-components/react/merge-props";
import { useRender } from "@base-ui-components/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		defaultVariants: {
			size: "default",
			variant: "default",
		},
		variants: {
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 px-3 text-xs",
				lg: "h-10 px-6",
				xl: "h-11 px-7 text-base",
				xs: "h-7 rounded-sm px-2 text-xs",
				icon: "size-9",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
				"icon-xl": "size-11",
				"icon-xs": "size-7 rounded-sm",
			},
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90",
				destructive:
					"bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30",
				"destructive-outline":
					"border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10",
				outline:
					"border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
		},
	},
);

interface ButtonProps extends useRender.ComponentProps<"button"> {
	variant?: VariantProps<typeof buttonVariants>["variant"];
	size?: VariantProps<typeof buttonVariants>["size"];
}

function Button({ className, variant, size, render, ...props }: ButtonProps) {
	const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
		render ? undefined : "button";

	const defaultProps = {
		className: cn(buttonVariants({ className, size, variant })),
		"data-slot": "button",
		type: typeValue,
	};

	return useRender({
		defaultTagName: "button",
		props: mergeProps<"button">(defaultProps, props),
		render,
	});
}

export { Button, buttonVariants };
