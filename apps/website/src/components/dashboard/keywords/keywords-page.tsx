import {
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import {
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createColumns } from '@/components/dashboard/keywords/columns';
import {
    formatSummaryWindow,
    getStaleDayCount,
    parseOptionalInteger,
    resolveSelectedSearchTerm,
} from '@/components/dashboard/keywords/keywords-page-utils';
import { KeywordsToolbar } from '@/components/dashboard/keywords/keywords-toolbar';
import { KeywordsTableView } from '@/components/dashboard/keywords/table-view';
import { TrendCanvas } from '@/components/dashboard/keywords/trend-canvas';
import type { SearchTermRow } from '@/components/dashboard/keywords/types';
import { useSearchTermsWindowSelection } from '@/components/dashboard/keywords/use-search-terms-window-selection';
import { api } from '@/lib/trpc';

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
        const nextSelectedSearchTerm = resolveSelectedSearchTerm({
            rows,
            selectedSearchTerm,
        });
        if (selectedSearchTerm !== nextSelectedSearchTerm) {
            setSelectedSearchTerm(nextSelectedSearchTerm);
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
        <div className='flex h-full min-h-0 flex-col overflow-hidden bg-background'>
            <KeywordsToolbar
                activeWindow={activeWindow}
                customRange={customRange}
                customSelectionError={customSelectionError}
                datePickerRange={datePickerRange}
                loadedCount={rows.length}
                maxRankValue={maxRankValue}
                minRankValue={minRankValue}
                onDateRangeSelect={handleDateRangeSelect}
                onDayClick={handleDayClick}
                onMaxRankChange={setMaxRankValue}
                onMinRankChange={setMinRankValue}
                onPresetClick={handlePresetClick}
                onSearchValueChange={setSearchValue}
                searchValue={searchValue}
                staleDays={staleDays}
                summaryWindow={summaryWindow}
                totalFiltered={summary?.totalFiltered ?? null}
            />

            <div className='grid min-h-0 flex-1 grid-rows-[minmax(14rem,38%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:grid-rows-1'>
                <div className='min-h-0 min-w-0 border-b border-border lg:border-b-0 lg:border-r'>
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
                <div className='min-h-0 min-w-0'>
                    <TrendCanvas
                        selectedSearchTerm={selectedSearchTerm}
                        reportPeriod={queryInput.reportPeriod}
                    />
                </div>
            </div>
        </div>
    );
};
