import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import {
    SEARCH_TERMS_WINDOW_PRESETS,
    type SearchTermsCustomRange,
    type SearchTermsPickerRange,
    type SearchTermsWindowPresetKey,
    type SearchTermsWindowSelectionKey,
} from '@/components/dashboard/keywords/search-terms-window';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const DateWindowSelector = ({
    activePreset,
    customRange,
    datePickerRange,
    onDayClick,
    onDateRangeSelect,
    onPresetClick,
}: {
    activePreset: SearchTermsWindowSelectionKey;
    customRange: SearchTermsCustomRange;
    datePickerRange: SearchTermsPickerRange;
    onDayClick: (date: Date) => void;
    onDateRangeSelect: (range: SearchTermsPickerRange) => void;
    onPresetClick: (key: SearchTermsWindowPresetKey) => void;
}) => (
    <div className='flex h-full items-center gap-0.5 border-r border-border px-1'>
        {SEARCH_TERMS_WINDOW_PRESETS.map((range) => (
            <button
                key={range.key}
                type='button'
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
                        variant={activePreset === 'custom' ? 'default' : 'ghost'}
                        className={cn(
                            'h-auto gap-1 rounded-none px-2 py-1 font-mono text-[11px] font-medium',
                            activePreset !== 'custom' && 'text-muted-foreground',
                        )}
                    />
                }
            >
                <CalendarDays className='size-3' />
                {customRange ? (
                    <span>
                        {format(customRange[0], 'MMM d')} &ndash; {format(customRange[1], 'MMM d, y')}
                    </span>
                ) : (
                    <span>CUSTOM</span>
                )}
            </PopoverTrigger>
            <PopoverPopup align='start'>
                <Calendar
                    mode='range'
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
);
