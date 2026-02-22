import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

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
				<button
					type="button"
					onClick={() => onSearchValueChange('')}
					className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
					aria-label="Clear search"
				>
					<X className="size-3.5" />
				</button>
			) : null}
		</div>
	</div>
);
