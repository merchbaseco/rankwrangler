import { Loader2, RefreshCw, Search } from 'lucide-react';
import { type ReactNode, useDeferredValue, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/trpc';
import { formatNumber } from '@/lib/utils';

export const KeywordsPage = () => {
    const defaults = useMemo(() => getDefaultPreviousMonthDateWindow(), []);
    const [searchValue, setSearchValue] = useState('');
    const [minRankValue, setMinRankValue] = useState('');
    const [maxRankValue, setMaxRankValue] = useState('');
    const deferredSearch = useDeferredValue(searchValue.trim());
    const baseInput = useMemo(
        () => ({
            dataEndDate: defaults.dataEndDate,
            dataStartDate: defaults.dataStartDate,
            marketplaceId: 'ATVPDKIKX0DER',
            reportPeriod: 'MONTH' as const,
        }),
        [defaults]
    );

    const queryInput = useMemo(
        () => ({
            ...baseInput,
            limit: 100,
            maxRank: parseOptionalInteger(maxRankValue),
            minRank: parseOptionalInteger(minRankValue),
            search: deferredSearch.length > 0 ? deferredSearch : undefined,
        }),
        [baseInput, deferredSearch, maxRankValue, minRankValue]
    );

    const statusQuery = api.api.app.searchTermsStatus.useQuery(baseInput, {
        refetchInterval: 4000,
        refetchOnWindowFocus: true,
    });
    const isFetchInProgress =
        statusQuery.data?.status.status === 'queued' || statusQuery.data?.status.status === 'in_progress';
    const query = api.api.app.searchTermsList.useInfiniteQuery(queryInput, {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        refetchInterval: isFetchInProgress ? 4000 : false,
        refetchOnWindowFocus: false,
    });
    const refreshMutation = api.api.app.searchTermsRefresh.useMutation({
        onSuccess: () => {
            void statusQuery.refetch();
            void query.refetch();
        },
    });

    const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
    const summary = query.data?.pages[0]?.summary ?? null;
    const fetchStatus = statusQuery.data?.status ?? summary?.status ?? null;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
            <div className="shrink-0 border-b border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            placeholder="Search terms"
                            className="h-8 pl-8 text-xs"
                        />
                    </div>
                    <Input
                        value={minRankValue}
                        onChange={(event) => setMinRankValue(event.target.value)}
                        placeholder="Min rank"
                        className="h-8 w-28 text-xs"
                    />
                    <Input
                        value={maxRankValue}
                        onChange={(event) => setMaxRankValue(event.target.value)}
                        placeholder="Max rank"
                        className="h-8 w-28 text-xs"
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-sm px-3 text-xs"
                        onClick={() => refreshMutation.mutate(baseInput)}
                        disabled={refreshMutation.isPending || isFetchInProgress}
                    >
                        {refreshMutation.isPending || isFetchInProgress ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-1 size-3" />
                        )}
                        {isFetchInProgress ? 'Fetching...' : 'Refresh'}
                    </Button>
                </div>

                <div className="text-muted-foreground flex items-center gap-4 text-[11px] font-mono">
                    <span>
                        Window: {summary?.dataStartDate ?? defaults.dataStartDate} to{' '}
                        {summary?.dataEndDate ?? defaults.dataEndDate}
                    </span>
                    <span>Report: {summary?.reportId ?? '--'}</span>
                    <span>Terms: {summary ? formatNumber(summary.totalFiltered) : '--'}</span>
                    <span>Fetched: {summary?.fetchedAt?.slice(0, 19).replace('T', ' ') ?? '--'}</span>
                    <span>Status: {formatFetchStatus(fetchStatus?.status ?? 'idle')}</span>
                    {fetchStatus?.activeJobId ? <span>Job: {fetchStatus.activeJobId}</span> : null}
                    {fetchStatus?.lastError ? (
                        <span className="text-destructive">Error: {fetchStatus.lastError}</span>
                    ) : null}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-card">
                        <tr className="border-b border-border">
                            <TableHead className="w-[40%]">Keyword</TableHead>
                            <TableHead>Rank</TableHead>
                            <TableHead>Click Share Top 3</TableHead>
                            <TableHead>Conversion Share Top 3</TableHead>
                            <TableHead>Rows</TableHead>
                        </tr>
                    </thead>
                    <tbody>
                        {query.isLoading ? (
                            <tr>
                                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                                    Loading search terms...
                                </td>
                            </tr>
                        ) : null}
                        {query.error ? (
                            <tr>
                                <td className="px-3 py-6 text-center text-destructive" colSpan={5}>
                                    Failed to load search terms.
                                </td>
                            </tr>
                        ) : null}
                        {!query.isLoading && !query.error && rows.length === 0 ? (
                            <tr>
                                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                                    No search terms found for the current filters.
                                </td>
                            </tr>
                        ) : null}
                        {rows.map((row) => (
                            <tr className="border-b border-border hover:bg-muted/35" key={row.searchTerm}>
                                <TableCell className="font-medium text-foreground">{row.searchTerm}</TableCell>
                                <TableCell className="font-mono text-muted-foreground">
                                    {formatNumber(row.searchFrequencyRank)}
                                </TableCell>
                                <TableCell className="font-mono text-muted-foreground">
                                    {formatShare(row.clickShareTop3Sum)}
                                </TableCell>
                                <TableCell className="font-mono text-muted-foreground">
                                    {formatShare(row.conversionShareTop3Sum)}
                                </TableCell>
                                <TableCell className="font-mono text-muted-foreground">
                                    {formatNumber(row.topRowsCount)}
                                </TableCell>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {query.hasNextPage ? (
                    <div className="border-t border-border p-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-sm px-3 text-xs"
                            onClick={() => void query.fetchNextPage()}
                            disabled={query.isFetchingNextPage}
                        >
                            {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

const TableHead = ({ children, className }: { children: ReactNode; className?: string }) => (
    <th className={`px-3 py-2 text-left font-medium text-muted-foreground ${className ?? ''}`}>{children}</th>
);

const TableCell = ({ children, className }: { children: ReactNode; className?: string }) => (
    <td className={`px-3 py-2 align-top ${className ?? ''}`}>{children}</td>
);

const parseOptionalInteger = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric < 1) {
        return undefined;
    }

    return Math.floor(numeric);
};

const formatShare = (value: number) => `${(value * 100).toFixed(2)}%`;

const formatFetchStatus = (status: 'idle' | 'queued' | 'in_progress' | 'completed' | 'failed') => {
    if (status === 'in_progress') {
        return 'in progress';
    }

    return status;
};

const getDefaultPreviousMonthDateWindow = () => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonthEnd = new Date(monthStart.getTime() - 24 * 60 * 60 * 1000);
    const previousMonthStart = new Date(
        Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1)
    );

    return {
        dataEndDate: previousMonthEnd.toISOString().slice(0, 10),
        dataStartDate: previousMonthStart.toISOString().slice(0, 10),
    };
};
