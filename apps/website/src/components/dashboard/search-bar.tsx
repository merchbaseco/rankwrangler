import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const SearchBar = ({
	onSearchValueChange,
	searchValue,
}: {
	onSearchValueChange: (nextValue: string) => void;
	searchValue: string;
}) => (
	<div className="shrink-0 border-b border-border bg-card">
		<div className="relative flex items-center">
			<Search className="text-muted-foreground absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
			<Input
				value={searchValue}
				onChange={(event) => onSearchValueChange(event.target.value)}
				placeholder="Search ASIN, brand, or product title..."
				className="h-9 rounded-none border-0 bg-transparent px-9 text-xs shadow-none focus-within:ring-0"
			/>
			{searchValue.trim().length > 0 ? (
				<Button
					onClick={() => onSearchValueChange("")}
					aria-label="Clear search"
					className="absolute right-3 top-1/2 size-7 -translate-y-1/2 rounded-sm p-0 text-muted-foreground hover:text-foreground"
					size="sm"
					variant="ghost"
				>
					<X className="size-3.5" />
				</Button>
			) : null}
		</div>
	</div>
);
