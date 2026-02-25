import type {
	HistoryCustomRange,
	HistoryPickerRange,
	HistoryRangeSelectionKey,
} from "@rankwrangler/history-chart/history-chart-range";
import {
	HISTORY_RANGE_PRESETS,
	type HistoryRangePresetKey,
} from "@rankwrangler/history-chart/history-chart-types";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
	type MouseEvent as ReactMouseEvent,
	type RefObject,
	useEffect,
	useRef,
	useState,
} from "react";
import { DayPicker } from "react-day-picker";

export const DateRangePresets = ({
	activeRange,
	customRange,
	datePickerRange,
	onDateRangeSelect,
	onDayClick,
	onRangeChange,
}: {
	activeRange: HistoryRangeSelectionKey;
	customRange: HistoryCustomRange;
	datePickerRange: HistoryPickerRange;
	onDateRangeSelect: (range: HistoryPickerRange) => void;
	onDayClick: (date: Date) => void;
	onRangeChange: (key: HistoryRangePresetKey) => void;
}) => {
	const [isCalendarOpen, setIsCalendarOpen] = useState(false);
	const calendarContainerRef = useRef<HTMLDivElement>(null);

	useOutsideClick(calendarContainerRef, isCalendarOpen, () => {
		setIsCalendarOpen(false);
	});

	useEffect(() => {
		if (activeRange === "custom" && customRange) {
			setIsCalendarOpen(false);
		}
	}, [activeRange, customRange]);

	const handleCustomClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setIsCalendarOpen((open) => !open);
	};

	return (
		<div className="relative flex items-center gap-1">
			{HISTORY_RANGE_PRESETS.map((preset) => (
				<button
					className={`px-2 py-1 font-mono font-semibold text-[12px] tracking-wide transition-colors ${
						activeRange === preset.key
							? "bg-black text-white"
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
					{preset.shortLabel}
				</button>
			))}
			<div ref={calendarContainerRef}>
				<button
					className={`flex items-center gap-1 px-2 py-1 font-mono font-semibold text-[12px] tracking-wide transition-colors ${
						activeRange === "custom"
							? "bg-black text-white"
							: "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
					}`}
					onClick={handleCustomClick}
					type="button"
				>
					<CalendarDays className="h-3.5 w-3.5" />
					<span>{formatCustomRangeLabel(customRange)}</span>
				</button>
				{isCalendarOpen ? (
					<div className="absolute top-[calc(100%+8px)] left-0 z-30 rounded-md border border-gray-300 bg-white p-2 shadow-lg">
						<DayPicker
							className="font-mono text-[12px]"
							classNames={{
								button_next:
									"flex size-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100",
								button_previous:
									"flex size-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100",
								caption_label:
									"flex h-7 items-center text-[12px] font-semibold text-gray-700",
								day: "h-8 w-8 p-0",
								day_button:
									"flex h-8 w-8 items-center justify-center rounded text-[12px] text-gray-700 hover:bg-gray-100",
								month: "space-y-2",
								month_caption: "relative flex items-center justify-center",
								months: "flex gap-4",
								nav: "absolute inset-x-0 top-0 flex justify-between",
								outside: "text-gray-300",
								range_end: "bg-black text-white",
								range_middle: "bg-gray-100 text-gray-800",
								range_start: "bg-black text-white",
								today: "font-semibold text-gray-900",
								weekday:
									"h-8 w-8 text-center text-[11px] font-medium text-gray-500 uppercase",
							}}
							components={{ Chevron: DayPickerChevron }}
							defaultMonth={customRange?.[0]}
							disabled={{ after: new Date() }}
							mode="range"
							numberOfMonths={2}
							onDayClick={onDayClick}
							onSelect={onDateRangeSelect}
							selected={datePickerRange}
							showOutsideDays
						/>
					</div>
				) : null}
			</div>
		</div>
	);
};

const formatCustomRangeLabel = (customRange: [Date, Date] | null) => {
	if (!customRange) {
		return "CUSTOM";
	}

	const shortFormatter = new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	});
	const longFormatter = new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	return `${shortFormatter.format(customRange[0])} - ${longFormatter.format(customRange[1])}`;
};

const useOutsideClick = (
	ref: RefObject<HTMLElement>,
	enabled: boolean,
	onOutside: () => void
) => {
	useEffect(() => {
		if (!enabled) {
			return;
		}

		const handleMouseDown = (event: MouseEvent) => {
			if (!ref.current) {
				return;
			}

			if (event.composedPath().includes(ref.current)) {
				return;
			}

			onOutside();
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onOutside();
			}
		};

		window.addEventListener("mousedown", handleMouseDown);
		window.addEventListener("keydown", handleEscape);

		return () => {
			window.removeEventListener("mousedown", handleMouseDown);
			window.removeEventListener("keydown", handleEscape);
		};
	}, [enabled, onOutside, ref]);
};

const DayPickerChevron = ({
	orientation,
	className,
}: {
	orientation?: "left" | "right" | "up" | "down";
	className?: string;
}) => {
	if (orientation === "left") {
		return <ChevronLeft className={className} />;
	}

	return <ChevronRight className={className} />;
};
