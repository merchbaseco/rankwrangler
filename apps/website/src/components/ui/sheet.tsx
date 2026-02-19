import { Dialog } from "@base-ui-components/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetClose = Dialog.Close;

const sheetPopupVariants = cva(
	"fixed z-50 flex max-h-screen flex-col overflow-hidden bg-background shadow-xl outline-none transition-transform duration-200 ease-out",
	{
		defaultVariants: {
			side: "right",
			variant: "default",
		},
		variants: {
			side: {
				bottom: "inset-x-0 bottom-0 w-full max-h-[80vh]",
				left: "left-0 top-0 h-full w-[92vw] sm:max-w-2xl",
				right: "right-0 top-0 h-full w-[94vw] sm:max-w-3xl",
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
				className: "rounded-t-2xl border-t border-border",
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
				className: "rounded-b-2xl border-b border-border",
			},
			{
				side: "bottom",
				variant: "inset",
				className:
					"bottom-2 max-h-[calc(80vh-0.5rem)] rounded-2xl border border-border sm:bottom-4 sm:max-h-[calc(80vh-1rem)]",
			},
			{
				side: "left",
				variant: "inset",
				className:
					"left-2 top-2 h-[calc(100%-1rem)] rounded-2xl border border-border sm:left-4 sm:top-4 sm:h-[calc(100%-2rem)]",
			},
			{
				side: "right",
				variant: "inset",
				className:
					"right-2 top-2 h-[calc(100%-1rem)] rounded-2xl border border-border sm:right-4 sm:top-4 sm:h-[calc(100%-2rem)]",
			},
			{
				side: "top",
				variant: "inset",
				className: "top-2 rounded-2xl border border-border sm:top-4",
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
			<Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
			<Dialog.Viewport className="fixed inset-0 z-50">
				<Dialog.Popup
					className={cn(sheetPopupVariants({ side, variant }), className)}
					ref={ref}
					{...props}
				>
					{children}
					<Dialog.Close
						className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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

const SheetHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
	<div className={cn("flex flex-col gap-1.5 p-4 pb-0", className)} {...props} />
);

const SheetFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
	<div
		className={cn(
			"mt-auto flex flex-col-reverse gap-2 p-4 pt-0 sm:flex-row sm:justify-end",
			className,
		)}
		{...props}
	/>
);

const SheetTitle = React.forwardRef<
	HTMLHeadingElement,
	React.ComponentProps<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
	<Dialog.Title
		ref={ref}
		className={cn("font-semibold text-foreground", className)}
		{...props}
	/>
));

SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
	HTMLParagraphElement,
	React.ComponentProps<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
	<Dialog.Description
		ref={ref}
		className={cn("text-muted-foreground text-sm", className)}
		{...props}
	/>
));

SheetDescription.displayName = "SheetDescription";

// Backward-compatible alias while usages migrate to SheetPopup.
const SheetContent = SheetPopup;

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetPanel,
	SheetPopup,
	SheetTitle,
	SheetTrigger,
};
