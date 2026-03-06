import { Slider as SliderPrimitive } from "@base-ui-components/react/slider";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

const Slider = ({
	className,
	children,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: SliderPrimitive.Root.Props) => {
	const values = useMemo(() => {
		if (value !== undefined) {
			return Array.isArray(value) ? value : [value];
		}
		if (defaultValue !== undefined) {
			return Array.isArray(defaultValue) ? defaultValue : [defaultValue];
		}
		return [min];
	}, [value, defaultValue, min]);

	return (
		<SliderPrimitive.Root
			className={cn("data-[orientation=horizontal]:w-full", className)}
			defaultValue={defaultValue}
			max={max}
			min={min}
			value={value}
			{...props}
		>
			{children}
			<SliderPrimitive.Control className="flex touch-none select-none data-disabled:pointer-events-none data-[orientation=horizontal]:w-full data-[orientation=horizontal]:min-w-20 data-disabled:opacity-64">
				<SliderPrimitive.Track className="relative grow select-none before:absolute before:rounded-full before:bg-input data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=horizontal]:before:inset-x-0 data-[orientation=horizontal]:before:inset-y-0">
					<SliderPrimitive.Indicator className="select-none rounded-full bg-primary" />
					{Array.from({ length: values.length }, (_, index) => (
						<SliderPrimitive.Thumb
							className="block size-4 shrink-0 select-none rounded-full border border-input bg-white shadow-xs/5 outline-none transition-[box-shadow,scale] has-focus-visible:ring-[3px] has-focus-visible:ring-ring/24 data-dragging:scale-120 dark:border-background dark:bg-foreground dark:has-focus-visible:ring-ring/48 [:has(*:focus-visible),[data-dragging]]:shadow-none"
							index={index}
							key={index}
						/>
					))}
				</SliderPrimitive.Track>
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	);
};

export { Slider };
