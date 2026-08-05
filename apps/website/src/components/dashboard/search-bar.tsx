import { Search, X } from "lucide-react";
import type { FormEventHandler, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const SearchBar = ({
	children,
	className,
	disabled = false,
	inputAriaLabel,
	onSearchValueChange,
	onSubmit,
	placeholder = "Search ASIN, brand, or product title...",
	searchValue,
}: {
	children?: ReactNode;
	className?: string;
	disabled?: boolean;
	inputAriaLabel?: string;
	onSearchValueChange: (nextValue: string) => void;
	onSubmit?: FormEventHandler<HTMLFormElement>;
	placeholder?: string;
	searchValue: string;
}) => (
	<form
		className={cn(
			"flex shrink-0 items-center border-b border-border bg-card",
			className,
		)}
		onSubmit={(event) => {
			event.preventDefault();
			onSubmit?.(event);
		}}
	>
		<div className="relative min-w-0 flex-1">
			<Search className="text-muted-foreground absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
			<Input
				aria-label={inputAriaLabel}
				disabled={disabled}
				value={searchValue}
				onChange={(event) => onSearchValueChange(event.target.value)}
				placeholder={placeholder}
				className="h-9 rounded-none border-0 bg-transparent px-9 text-xs shadow-none focus-within:ring-0"
			/>
			{searchValue.trim().length > 0 ? (
				<Button
					onClick={() => onSearchValueChange("")}
					aria-label="Clear search"
					className="absolute right-3 top-1/2 size-7 -translate-y-1/2 rounded-sm p-0 text-muted-foreground hover:text-foreground"
					size="sm"
					type="button"
					variant="ghost"
				>
					<X className="size-3.5" />
				</Button>
			) : null}
		</div>
		{children ? (
			<div className="flex shrink-0 items-center gap-2 px-2">
				{children}
			</div>
		) : null}
	</form>
);
