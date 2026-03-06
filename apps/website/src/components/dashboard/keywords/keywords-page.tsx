import {
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { Info, Search } from 'lucide-react';
import {
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createColumns } from '@/components/dashboard/keywords/columns';
import { DateWindowSelector } from '@/components/dashboard/keywords/date-window-selector';
import {
    formatSummaryWindow,
    getStaleDayCount,
    getStaleTooltip,
    parseOptionalInteger,
} from '@/components/dashboard/keywords/keywords-page-utils';
import { KeywordsTableView } from '@/components/dashboard/keywords/table-view';
import { TrendCanvas } from '@/components/dashboard/keywords/trend-canvas';
import type { SearchTermRow } from '@/components/dashboard/keywords/types';
import { useSearchTermsWindowSelection } from '@/components/dashboard/keywords/use-search-terms-window-selection';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipPopup,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { api } from '@/lib/trpc';
import { formatNumber } from '@/lib/utils';

const MARKETPLACE_ID = 'ATVPDKIKX0DER';

export const KeywordsPage = () => {
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const [searchValue, setSearchValue] = useState('');
    const [minRankValue, setMinRankValue] = useState('');
    const [maxRankValue, setMaxRankValue] = useState('');
    const [selectedSearchTerm, setSelectedSearchTerm] = useState<string | null>(null);
    const {
        activeWindow,
        activeWindowInput,
        customRange,
        customSelectionError,
        datePickerRange,
        handleDateRangeSelect,
        handleDayClick,
        handlePresetClick,
    } = useSearchTermsWindowSelection();
    const deferredSearch = useDeferredValue(searchValue.trim());

    const queryInput = useMemo(
        () => ({
            marketplaceId: MARKETPLACE_ID,
            reportPeriod: activeWindowInput.reportPeriod,
            ...(activeWindowInput.dataStartDate && activeWindowInput.dataEndDate
                ? {
                    dataEndDate: activeWindowInput.dataEndDate,
                    dataStartDate: activeWindowInput.dataStartDate,
                }
                : {}),
            limit: 100,
            maxRank: parseOptionalInteger(maxRankValue),
            minRank: parseOptionalInteger(minRankValue),
            search: deferredSearch.length > 0 ? deferredSearch : undefined,
        }),
        [activeWindowInput, deferredSearch, maxRankValue, minRankValue],
    );

    const query = api.api.app.searchterms.list.useInfiniteQuery(queryInput, {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        refetchOnWindowFocus: false,
    });

    const rows = useMemo<SearchTermRow[]>(
        () => query.data?.pages.flatMap((page) => page.items) ?? [],
        [query.data],
    );
    const summary = query.data?.pages[0]?.summary ?? null;
    const columns = useMemo(() => createColumns(), []);
    const colgroupColumns = useMemo(
        () =>
            columns.map((column, index) => {
                const meta = column.meta as { flex?: boolean } | undefined;
                const key =
                    (typeof column.id === 'string' && column.id) ||
                    (typeof column.accessorKey === 'string' && column.accessorKey) ||
                    `column-${index}`;
                return { key, width: meta?.flex ? undefined : column.size };
            }),
        [columns],
    );

    useEffect(() => {
        if (!query.hasNextPage || query.isFetchingNextPage) {
            return;
        }

        const node = loadMoreRef.current;
        if (!node) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                if (
                    !entry?.isIntersecting ||
                    !query.hasNextPage ||
                    query.isFetchingNextPage
                ) {
                    return;
                }
                void query.fetchNextPage();
            },
            { rootMargin: '240px 0px' },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

    useEffect(() => {
        if (rows.length === 0) {
            setSelectedSearchTerm(null);
            return;
        }

        const hasSelected =
            selectedSearchTerm !== null &&
            rows.some((row) => row.searchTerm === selectedSearchTerm);
        if (!hasSelected) {
            setSelectedSearchTerm(rows[0]?.searchTerm ?? null);
        }
    }, [rows, selectedSearchTerm]);

    const table = useReactTable({
        columns,
        data: rows,
        getCoreRowModel: getCoreRowModel(),
        enableSorting: false,
    });

    const summaryWindow = formatSummaryWindow(summary);
    const staleDays = getStaleDayCount({
        dataEndDate: summary?.dataEndDate ?? null,
        activeWindow,
    });

    return (
        <div className='flex h-full min-h-0 flex-col overflow-hidden bg-card'>
            <div className='flex h-9 shrink-0 items-center border-b border-border text-xs'>
                <DateWindowSelector
                    activePreset={activeWindow}
                    customRange={customRange}
                    datePickerRange={datePickerRange}
                    onDayClick={handleDayClick}
                    onDateRangeSelect={handleDateRangeSelect}
                    onPresetClick={handlePresetClick}
                />

                <div className='relative flex h-full items-center border-r border-border'>
                    <Search className='pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
                    <Input
                        value={searchValue}
                        onChange={(event) => setSearchValue(event.target.value)}
                        placeholder='Search terms...'
                        className='h-full w-48 rounded-none border-0 bg-transparent pl-9 text-xs shadow-none focus-within:ring-0'
                    />
                </div>

                <div className='flex h-full items-center border-r border-border'>
                    <Input
                        value={minRankValue}
                        onChange={(event) => setMinRankValue(event.target.value)}
                        placeholder='Min rank'
                        className='h-full w-20 rounded-none border-0 bg-transparent text-center text-xs shadow-none focus-within:ring-0'
                    />
                    <span className='text-muted-foreground'>-</span>
                    <Input
                        value={maxRankValue}
                        onChange={(event) => setMaxRankValue(event.target.value)}
                        placeholder='Max rank'
                        className='h-full w-20 rounded-none border-0 bg-transparent text-center text-xs shadow-none focus-within:ring-0'
                    />
                </div>

                <div className='flex flex-1 items-center justify-end gap-3 px-3 font-mono text-[11px] text-muted-foreground'>
                    {customSelectionError ? (
                        <span className='truncate text-destructive'>
                            {customSelectionError}
                        </span>
                    ) : null}
                    <span className='flex items-center gap-1'>
                        {summaryWindow}
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
                    <span className='text-border'>|</span>
                    <span>
                        {summary ? formatNumber(summary.totalFiltered) : '--'} terms
                    </span>
                    <span className='text-border'>|</span>
                    <span>{formatNumber(rows.length)} loaded</span>
                </div>
            </div>

            <div className='flex min-h-0 flex-1 overflow-hidden'>
                <div className='min-h-0 w-[30%] min-w-[260px] max-w-[340px] border-r border-border'>
                    <KeywordsTableView
                        table={table}
                        colgroupColumns={colgroupColumns}
                        columnsCount={columns.length}
                        hasNextPage={Boolean(query.hasNextPage)}
                        isFetchingNextPage={query.isFetchingNextPage}
                        isLoading={query.isLoading}
                        hasError={Boolean(query.error)}
                        loadMoreRef={loadMoreRef}
                        selectedSearchTerm={selectedSearchTerm}
                        onSelectSearchTerm={setSelectedSearchTerm}
                    />
                </div>
                <div className='min-h-0 min-w-0 flex-1'>
                    <TrendCanvas
                        selectedSearchTerm={selectedSearchTerm}
                        reportPeriod={queryInput.reportPeriod}
                    />
                </div>
            </div>
        </div>
    );
};
