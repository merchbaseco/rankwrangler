import { mergeProps } from "@base-ui-components/react/merge-props";
import { useRender } from "@base-ui-components/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
	"inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
	{
		defaultVariants: {
			size: "default",
			variant: "default",
		},
		variants: {
			size: {
				default: "",
				sm: "rounded-sm px-1.5 text-xs",
				lg: "px-2.5 text-sm",
			},
			variant: {
				default: "border-transparent bg-primary text-primary-foreground",
				secondary: "border-transparent bg-secondary text-secondary-foreground",
				destructive: "border-transparent bg-destructive text-white",
				outline: "border-border text-foreground",
				error: "border-destructive/20 bg-destructive/10 text-destructive",
				info: "border-info/20 bg-info/10 text-info-foreground",
				success: "border-success/20 bg-success/10 text-success-foreground",
				warning: "border-warning/20 bg-warning/15 text-warning-foreground",
			},
		},
	},
);

interface BadgeProps extends useRender.ComponentProps<"span"> {
	variant?: VariantProps<typeof badgeVariants>["variant"];
	size?: VariantProps<typeof badgeVariants>["size"];
}

function Badge({ className, variant, size, render, ...props }: BadgeProps) {
	const defaultProps = {
		className: cn(badgeVariants({ className, size, variant })),
		"data-slot": "badge",
	};

	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(defaultProps, props),
		render,
	});
}

export { Badge, badgeVariants };
