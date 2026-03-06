import { Dialog as DialogPrimitive } from "@base-ui-components/react/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogBackdrop = ({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) => (
	<DialogPrimitive.Backdrop
		className={cn("fixed inset-0 z-50 bg-black/45", className)}
		data-slot="dialog-backdrop"
		{...props}
	/>
);

const DialogViewport = ({
	className,
	...props
}: DialogPrimitive.Viewport.Props) => (
	<DialogPrimitive.Viewport
		className={cn(
			"fixed inset-0 z-50 flex items-center justify-center p-4",
			className,
		)}
		data-slot="dialog-viewport"
		{...props}
	/>
);

const DialogPopup = ({ className, ...props }: DialogPrimitive.Popup.Props) => (
	<DialogPrimitive.Popup
		className={cn(
			"overflow-hidden rounded-md border border-border bg-background shadow-lg outline-none",
			className,
		)}
		data-slot="dialog-popup"
		{...props}
	/>
);

const DialogTitle = ({ className, ...props }: DialogPrimitive.Title.Props) => (
	<DialogPrimitive.Title
		className={cn(className)}
		data-slot="dialog-title"
		{...props}
	/>
);

const DialogClose = ({
	className,
	children,
	...props
}: DialogPrimitive.Close.Props) => (
	<Button
		aria-label="Close"
		className={cn(
			"size-7 rounded-sm p-0 text-muted-foreground hover:bg-muted hover:text-foreground",
			className,
		)}
		render={<DialogPrimitive.Close />}
		size="sm"
		variant="ghost"
		{...props}
	>
		{children ?? <X className="size-4" />}
	</Button>
);

export {
	Dialog,
	DialogBackdrop,
	DialogClose,
	DialogPopup,
	DialogPortal,
	DialogTitle,
	DialogViewport,
};
