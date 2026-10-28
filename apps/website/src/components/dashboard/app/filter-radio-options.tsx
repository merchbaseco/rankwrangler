import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const FilterRadioOptions = <Key extends string>({
	onSelect,
	options,
	selected,
}: {
	onSelect: (key: Key) => void;
	options: ReadonlyArray<{ key: Key; label: string }>;
	selected: Key;
}) => (
	<div className="flex flex-col gap-0.5">
		{options.map((option) => {
			const isActive = selected === option.key;
			return (
				<Button
					key={option.key}
					onClick={() => onSelect(option.key)}
					className={cn(
						"h-auto justify-start gap-2 rounded-sm px-2.5 py-1.5 text-sm",
						!isActive && "text-foreground/80 hover:bg-accent",
					)}
					size="sm"
					variant={isActive ? "default" : "ghost"}
				>
					<span
						className={cn(
							"flex size-3.5 items-center justify-center rounded-full border",
							isActive ? "border-primary-foreground" : "border-input",
						)}
					>
						{isActive ? (
							<span className="size-2 rounded-full bg-primary-foreground" />
						) : null}
					</span>
					<span>{option.label}</span>
				</Button>
			);
		})}
	</div>
);
