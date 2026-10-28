export const KeywordDirectoryFilter = <T extends string>({
	title,
	labels,
	values,
	counts,
	selected,
	onSelect,
}: {
	title: string;
	labels?: Partial<Record<T, string>>;
	values: readonly T[];
	counts?: Partial<Record<T, number>>;
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
				className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left capitalize hover:bg-accent ${selected === value ? "bg-accent font-medium" : "text-muted-foreground"}`}
			>
				<span className="truncate">
					{labels?.[value] ?? (value === "all" ? "Any popularity" : value)}
				</span>
				{counts?.[value] === undefined ? null : (
					<span className="font-mono tabular-nums text-muted-foreground">
						{counts[value].toLocaleString()}
					</span>
				)}
			</button>
		))}
	</section>
);
