export const KeywordDirectoryFilter = <T extends string>({
	title,
	labels,
	values,
	selected,
	onSelect,
}: {
	title: string;
	labels?: Partial<Record<T, string>>;
	values: readonly T[];
	selected: T;
	onSelect: (value: T) => void;
}) => (
	<section aria-label={title} className="border-b border-border py-2">
		<h2 className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
			{title}
		</h2>
		{values.map((value) => (
			<button
				key={value}
				type="button"
				onClick={() => onSelect(value)}
				aria-pressed={selected === value}
				className={`block w-full px-3 py-2 text-left capitalize hover:bg-accent ${selected === value ? "bg-accent font-medium" : "text-muted-foreground"}`}
			>
				{labels?.[value] ?? (value === "all" ? "Any popularity" : value)}
			</button>
		))}
	</section>
);
