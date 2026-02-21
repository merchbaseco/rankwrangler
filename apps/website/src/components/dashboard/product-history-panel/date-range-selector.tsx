import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { DATE_RANGES } from '@/components/dashboard/product-history-panel/types';
import type {
	ActiveRange,
	DateRangeKey,
	PickerRange,
	PickerValue,
} from '@/components/dashboard/product-history-panel/types';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const DateRangeSelector = ({
	activePreset,
	customRange,
	datePickerRange,
	onDayClick,
	onDateRangeSelect,
	onPresetClick,
}: {
	activePreset: ActiveRange;
	customRange: PickerValue;
	datePickerRange: PickerRange;
	onDayClick: (date: Date) => void;
	onDateRangeSelect: (range: DateRange | undefined) => void;
	onPresetClick: (key: DateRangeKey) => void;
}) => (
	<div className="mt-3 px-5">
		<div className="flex items-center gap-1">
			{DATE_RANGES.map((range) => (
				<button
					key={range.key}
					type="button"
					onClick={() => onPresetClick(range.key)}
					className={cn(
						'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
						activePreset === range.key
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:bg-accent',
					)}
				>
					{range.key === 'all' ? 'All' : range.key}
				</button>
			))}
			<Popover>
				<PopoverTrigger
					render={
						<Button
							variant={activePreset === 'custom' ? 'default' : 'ghost'}
							className={cn(
								'h-auto gap-1 rounded-md border-transparent px-2 py-1 text-xs font-medium',
								activePreset !== 'custom' && 'text-muted-foreground',
							)}
						/>
					}
				>
					<CalendarDays className="size-3.5" />
					{customRange ? (
						<span>
							{format(customRange[0], 'MMM d')} &ndash; {format(customRange[1], 'MMM d, y')}
						</span>
					) : (
						<span>Custom</span>
					)}
				</PopoverTrigger>
				<PopoverPopup align="start">
					<Calendar
						mode="range"
						numberOfMonths={2}
						selected={datePickerRange}
						onSelect={onDateRangeSelect}
						onDayClick={onDayClick}
						defaultMonth={customRange?.[0]}
						disabled={{ after: new Date() }}
					/>
				</PopoverPopup>
			</Popover>
		</div>
	</div>
);
