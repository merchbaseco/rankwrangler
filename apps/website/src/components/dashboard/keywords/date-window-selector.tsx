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
    className,
    customRange,
    datePickerRange,
    onDayClick,
    onDateRangeSelect,
    onPresetClick,
}: {
    activePreset: SearchTermsWindowSelectionKey;
    className?: string;
    customRange: SearchTermsCustomRange;
    datePickerRange: SearchTermsPickerRange;
    onDayClick: (date: Date) => void;
    onDateRangeSelect: (range: SearchTermsPickerRange) => void;
    onPresetClick: (key: SearchTermsWindowPresetKey) => void;
}) => (
    <div
        className={cn(
            'flex h-9 shrink-0 items-center gap-0.5 rounded-sm border border-border bg-background p-1',
            className,
        )}
    >
        {SEARCH_TERMS_WINDOW_PRESETS.map((range) => (
            <Button
                key={range.key}
                onClick={() => onPresetClick(range.key)}
                className='font-mono text-[11px] font-medium'
                size='xs'
                type='button'
                variant={activePreset === range.key ? 'secondary' : 'ghost'}
            >
                {range.shortLabel}
            </Button>
        ))}
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        size='xs'
                        variant={activePreset === 'custom' ? 'secondary' : 'ghost'}
                        className={cn(
                            'gap-1 font-mono text-[11px] font-medium',
                            activePreset !== 'custom' && 'text-muted-foreground',
                        )}
                    />
                }
            >
                <CalendarDays className='size-3' />
                {customRange ? (
                    <span className='whitespace-nowrap'>
                        {format(customRange[0], 'MMM d')} &ndash; {format(customRange[1], 'MMM d, y')}
                    </span>
                ) : (
                    <span>Custom</span>
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
