import { Info } from 'lucide-react';
import { DateWindowSelector } from '@/components/dashboard/keywords/date-window-selector';
import { getStaleTooltip } from '@/components/dashboard/keywords/keywords-page-utils';
import type {
	SearchTermsCustomRange,
	SearchTermsPickerRange,
	SearchTermsWindowPresetKey,
	SearchTermsWindowSelectionKey,
} from '@/components/dashboard/keywords/search-terms-window';
import { SearchBar } from '@/components/dashboard/search-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Tooltip,
	TooltipPopup,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatNumber } from '@/lib/utils';

export const KeywordsToolbar = ({
	activeWindow,
	customRange,
	customSelectionError,
	datePickerRange,
	loadedCount,
	maxRankValue,
	minRankValue,
	onDateRangeSelect,
	onDayClick,
	onMaxRankChange,
	onMinRankChange,
	onPresetClick,
	onSearchValueChange,
	searchValue,
	staleDays,
	summaryWindow,
	totalFiltered,
}: {
	activeWindow: SearchTermsWindowSelectionKey;
	customRange: SearchTermsCustomRange;
	customSelectionError: string | null;
	datePickerRange: SearchTermsPickerRange;
	loadedCount: number;
	maxRankValue: string;
	minRankValue: string;
	onDateRangeSelect: (range: SearchTermsPickerRange) => void;
	onDayClick: (date: Date) => void;
	onMaxRankChange: (value: string) => void;
	onMinRankChange: (value: string) => void;
	onPresetClick: (key: SearchTermsWindowPresetKey) => void;
	onSearchValueChange: (value: string) => void;
	searchValue: string;
	staleDays: number | null;
	summaryWindow: string;
	totalFiltered: number | null;
}) => (
	<header className='shrink-0 border-b border-border bg-card px-5 py-4'>
		<div className='flex flex-wrap items-start justify-between gap-4'>
			<div className='min-w-0'>
				<h1 className='font-display text-balance text-lg font-semibold text-foreground'>
					Search terms
				</h1>
				<p className='mt-1 max-w-2xl text-pretty text-xs text-muted-foreground'>
					Amazon demand signals with 90-day trend history and current results for
					the selected term.
				</p>
			</div>
			<div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground'>
				<span className='flex min-w-0 items-center gap-1'>
					<span className='truncate'>{summaryWindow}</span>
					{staleDays !== null ? (
						<Tooltip delay={0}>
							<TooltipTrigger
								render={<span />}
								className='inline-flex cursor-default'
							>
								<Info className='size-3 text-muted-foreground/60' />
							</TooltipTrigger>
							<TooltipPopup side='bottom' className='max-w-64'>
								{getStaleTooltip(staleDays)}
							</TooltipPopup>
						</Tooltip>
					) : null}
				</span>
				<span aria-hidden='true' className='text-border'>
					·
				</span>
				<span className='whitespace-nowrap'>
					{totalFiltered === null ? '--' : formatNumber(totalFiltered)} terms
				</span>
				<span aria-hidden='true' className='text-border'>
					·
				</span>
				<span className='whitespace-nowrap'>
					{formatNumber(loadedCount)} loaded
				</span>
			</div>
		</div>

		<div className='mt-4 flex min-w-0 flex-wrap items-center gap-2'>
			<DateWindowSelector
				activePreset={activeWindow}
				className='max-w-full overflow-x-auto'
				customRange={customRange}
				datePickerRange={datePickerRange}
				onDayClick={onDayClick}
				onDateRangeSelect={onDateRangeSelect}
				onPresetClick={onPresetClick}
			/>
			<SearchBar
				className='min-w-[14rem] flex-1 rounded-sm border-0 bg-background ring-1 ring-border'
				inputAriaLabel='Search terms'
				onSearchValueChange={onSearchValueChange}
				placeholder='Search terms...'
				searchValue={searchValue}
			/>
			<div className='flex h-9 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-background px-2'>
				<span className='text-xs text-muted-foreground'>Rank</span>
				<Input
					aria-label='Minimum search frequency rank'
					className='inline-flex w-16 text-center text-xs tabular-nums'
					min={1}
					name='min-rank'
					onChange={(event) => onMinRankChange(event.target.value)}
					placeholder='Min'
					size='sm'
					type='number'
					unstyled
					value={minRankValue}
				/>
				<span className='text-xs text-muted-foreground'>to</span>
				<Input
					aria-label='Maximum search frequency rank'
					className='inline-flex w-16 text-center text-xs tabular-nums'
					min={1}
					name='max-rank'
					onChange={(event) => onMaxRankChange(event.target.value)}
					placeholder='Max'
					size='sm'
					type='number'
					unstyled
					value={maxRankValue}
				/>
			</div>
		</div>

		{customSelectionError ? (
			<p className='mt-2 text-xs text-destructive'>{customSelectionError}</p>
		) : null}
	</header>
);
