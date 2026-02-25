const PRESETS = [
	{ key: "30d", label: "30D" },
	{ key: "90d", label: "90D" },
	{ key: "6m", label: "6M" },
	{ key: "1y", label: "1Y" },
	{ key: "all", label: "ALL" },
] as const;

export const DateRangePresets = ({
	activeRange,
	onRangeChange,
}: {
	activeRange: string;
	onRangeChange: (key: string) => void;
}) => (
	<div className="flex items-center gap-0.5">
		{PRESETS.map((preset) => (
			<button
				className={`rounded-sm px-2 py-0.5 font-medium font-mono text-[11px] transition-colors ${
					activeRange === preset.key
						? "bg-gray-900 text-white"
						: "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
				}`}
				key={preset.key}
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onRangeChange(preset.key);
				}}
				type="button"
			>
				{preset.label}
			</button>
		))}
	</div>
);
