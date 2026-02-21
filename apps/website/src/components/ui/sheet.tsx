import { Dialog } from "@base-ui-components/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const Sheet = Dialog.Root;

const sheetPopupVariants = cva(
	"fixed z-50 flex max-h-screen flex-col overflow-hidden bg-background shadow-lg outline-none transition-transform duration-300 ease-out",
	{
		defaultVariants: {
			side: "right",
			variant: "default",
		},
		variants: {
			side: {
				bottom: "inset-x-0 bottom-0 w-full max-h-[80vh]",
				left: "left-0 top-0 h-full w-[88vw] sm:max-w-xl",
				right: "right-0 top-0 h-full w-[92vw] sm:max-w-xl",
				top: "inset-x-0 top-0 w-full",
			},
			variant: {
				default: "",
				inset: "",
			},
		},
		compoundVariants: [
			{
				side: "bottom",
				variant: "default",
				className: "border-t border-border",
			},
			{
				side: "left",
				variant: "default",
				className: "border-r border-border",
			},
			{
				side: "right",
				variant: "default",
				className: "border-l border-border",
			},
			{
				side: "top",
				variant: "default",
				className: "border-b border-border",
			},
			{
				side: "bottom",
				variant: "inset",
				className: "bottom-2 rounded-md border border-border sm:bottom-4",
			},
			{
				side: "left",
				variant: "inset",
				className:
					"left-2 top-2 h-[calc(100%-1rem)] rounded-md border border-border sm:left-4 sm:top-4 sm:h-[calc(100%-2rem)]",
			},
			{
				side: "right",
				variant: "inset",
				className:
					"right-2 top-2 h-[calc(100%-1rem)] rounded-md border border-border sm:right-4 sm:top-4 sm:h-[calc(100%-2rem)]",
			},
			{
				side: "top",
				variant: "inset",
				className: "top-2 rounded-md border border-border sm:top-4",
			},
		],
	},
);

const SheetPopup = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof Dialog.Popup> &
		VariantProps<typeof sheetPopupVariants>
>(({ className, side, variant, children, ...props }, ref) => {
	return (
		<Dialog.Portal>
			<Dialog.Backdrop className="fixed inset-0 z-50 bg-black/45" />
			<Dialog.Viewport className="fixed inset-0 z-50">
				<Dialog.Popup
					className={cn(sheetPopupVariants({ side, variant }), className)}
					ref={ref}
					{...props}
				>
					{children}
					<Dialog.Close
						className="hover:bg-muted hover:text-foreground absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors"
						aria-label="Close"
					>
						<X className="size-4" />
					</Dialog.Close>
				</Dialog.Popup>
			</Dialog.Viewport>
		</Dialog.Portal>
	);
});

SheetPopup.displayName = "SheetPopup";

const SheetPanel = ({ className, ...props }: React.ComponentProps<"div">) => (
	<div className={cn("flex-1 overflow-y-auto p-4", className)} {...props} />
);

export { Sheet, SheetPanel, SheetPopup };
