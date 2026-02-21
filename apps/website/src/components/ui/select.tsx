import { Select as SelectPrimitive } from "@base-ui-components/react/select";
import { cva, type VariantProps } from "class-variance-authority";
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	ChevronsUpDownIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";

const Select = SelectPrimitive.Root;

const selectTriggerVariants = cva(
	"border-input data-placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-3 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		defaultVariants: {
			size: "default",
		},
		variants: {
			size: {
				default: "h-9",
				sm: "h-8 px-2.5 text-xs",
				lg: "h-10",
			},
		},
	},
);

const selectTriggerIconClassName = "size-4 text-muted-foreground";

const SelectTrigger = ({
	className,
	size = "default",
	children,
	...props
}: SelectPrimitive.Trigger.Props &
	VariantProps<typeof selectTriggerVariants>) => {
	return (
		<SelectPrimitive.Trigger
			className={cn(selectTriggerVariants({ size }), className)}
			data-slot="select-trigger"
			{...props}
		>
			{children}
			<SelectPrimitive.Icon data-slot="select-icon">
				<ChevronsUpDownIcon className={selectTriggerIconClassName} />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
};

const SelectValue = ({ className, ...props }: SelectPrimitive.Value.Props) => {
	return (
		<SelectPrimitive.Value
			className={cn("flex-1 truncate", className)}
			data-slot="select-value"
			{...props}
		/>
	);
};

const SelectPopup = ({
	className,
	children,
	side = "bottom",
	sideOffset = 4,
	align = "start",
	alignOffset = 0,
	alignItemWithTrigger = true,
	anchor,
	...props
}: SelectPrimitive.Popup.Props & {
	side?: SelectPrimitive.Positioner.Props["side"];
	sideOffset?: SelectPrimitive.Positioner.Props["sideOffset"];
	align?: SelectPrimitive.Positioner.Props["align"];
	alignOffset?: SelectPrimitive.Positioner.Props["alignOffset"];
	alignItemWithTrigger?: SelectPrimitive.Positioner.Props["alignItemWithTrigger"];
	anchor?: SelectPrimitive.Positioner.Props["anchor"];
}) => {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Positioner
				align={align}
				alignItemWithTrigger={alignItemWithTrigger}
				alignOffset={alignOffset}
				anchor={anchor}
				className="z-50 select-none"
				data-slot="select-positioner"
				side={side}
				sideOffset={sideOffset}
			>
				<SelectPrimitive.Popup
					className="origin-(--transform-origin) text-popover-foreground"
					data-slot="select-popup"
					{...props}
				>
					<SelectPrimitive.ScrollUpArrow
						className="flex h-6 w-full items-center justify-center"
						data-slot="select-scroll-up-arrow"
					>
						<ChevronUpIcon className="size-4" />
					</SelectPrimitive.ScrollUpArrow>
					<div className="min-w-(--anchor-width) overflow-hidden rounded-md border bg-popover shadow-md">
						<SelectPrimitive.List
							className={cn("max-h-(--available-height) overflow-y-auto p-1", className)}
							data-slot="select-list"
						>
							{children}
						</SelectPrimitive.List>
					</div>
					<SelectPrimitive.ScrollDownArrow
						className="flex h-6 w-full items-center justify-center"
						data-slot="select-scroll-down-arrow"
					>
						<ChevronDownIcon className="size-4" />
					</SelectPrimitive.ScrollDownArrow>
				</SelectPrimitive.Popup>
			</SelectPrimitive.Positioner>
		</SelectPrimitive.Portal>
	);
};

const SelectItem = ({
	className,
	children,
	...props
}: SelectPrimitive.Item.Props) => {
	return (
		<SelectPrimitive.Item
			className={cn(
				"focus:bg-accent focus:text-accent-foreground relative flex min-h-8 w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none data-disabled:pointer-events-none data-disabled:opacity-50",
				className,
			)}
			data-slot="select-item"
			{...props}
		>
			<span className="absolute right-2 flex size-3.5 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="size-4" />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
};

export {
	Select,
	SelectTrigger,
	SelectValue,
	SelectPopup,
	SelectItem,
};
