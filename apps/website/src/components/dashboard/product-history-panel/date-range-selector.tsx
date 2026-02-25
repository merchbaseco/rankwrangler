import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
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
    onDateRangeSelect: (range: PickerRange) => void;
    onPresetClick: (key: DateRangeKey) => void;
}) => (
    <div className="flex h-8 items-center border-b border-border bg-muted/30 pl-1 pr-3">
        <div className="flex items-center gap-0.5">
            {DATE_RANGES.map((range) => (
                <button
                    key={range.key}
                    type="button"
                    onClick={() => onPresetClick(range.key)}
                    className={cn(
                        'px-2 py-1 font-mono text-[11px] font-medium transition-colors',
                        activePreset === range.key
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                >
                    {range.shortLabel}
                </button>
            ))}
            <Popover>
                <PopoverTrigger
                    render={
                        <Button
                            variant={
                                activePreset === 'custom'
                                    ? 'default'
                                    : 'ghost'
                            }
                            className={cn(
                                'h-auto gap-1 rounded-none px-2 py-1 font-mono text-[11px] font-medium',
                                activePreset !== 'custom' &&
                                    'text-muted-foreground',
                            )}
                        />
                    }
                >
                    <CalendarDays className="size-3" />
                    {customRange ? (
                        <span>
                            {format(customRange[0], 'MMM d')} &ndash;{' '}
                            {format(customRange[1], 'MMM d, y')}
                        </span>
                    ) : (
                        <span>CUSTOM</span>
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
