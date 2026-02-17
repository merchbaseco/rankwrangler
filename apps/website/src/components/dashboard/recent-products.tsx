import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    type SortingState,
    useReactTable,
} from '@tanstack/react-table';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { ProductHistoryPanel } from '@/components/dashboard/product-history-panel';
import { api } from '@/lib/trpc';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Frame } from '@/components/ui/frame';
import { Sheet, SheetPanel, SheetPopup } from '@/components/ui/sheet';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

const MARKETPLACE_FLAGS: Record<string, string> = {
    ATVPDKIKX0DER: '🇺🇸',
    A1F83G8C2ARO7P: '🇬🇧',
    A1PA6795UKMFR9: '🇩🇪',
    A13V1IB3VIYZZH: '🇫🇷',
    A1VC38T7YXB528: '🇯🇵',
};

type Product = {
    asin: string;
    title: string | null;
    thumbnailUrl: string | null;
    brand: string | null;
    marketplaceId: string;
    rootCategoryBsr: number | null;
    lastFetched: string;
};

type SelectedHistoryProduct = {
    asin: string;
    marketplaceId: string;
    title: string | null;
};

const RowHistoryButton = ({
    asin,
    marketplaceId,
    title,
    isActive,
    onSelect,
}: {
    asin: string;
    marketplaceId: string;
    title: string | null;
    isActive: boolean;
    onSelect: (product: SelectedHistoryProduct) => void;
}) => {
    return (
        <button
            type="button"
            onClick={() => {
                onSelect({ asin, marketplaceId, title });
            }}
            className={cn(
                'rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                isActive
                    ? 'bg-[#25211d] text-white'
                    : 'bg-[#141210] text-white hover:bg-[#25211d]'
            )}
        >
            History
        </button>
    );
};

const getBsrBadgeVariant = (bsr: number | null) => {
    if (bsr === null) return 'outline' as const;
    if (bsr <= 1000) return 'success' as const;
    if (bsr <= 10000) return 'info' as const;
    if (bsr <= 100000) return 'warning' as const;
    return 'outline' as const;
};

const createColumns = ({
    onSelectHistory,
    selectedHistoryKey,
}: {
    onSelectHistory: (product: SelectedHistoryProduct) => void;
    selectedHistoryKey: string | null;
}): ColumnDef<Product>[] => {
    return [
        {
            accessorKey: 'thumbnailUrl',
            cell: ({ row }) => {
                const url = row.getValue('thumbnailUrl') as string | null;
                return url ? (
                    <div
                        className="flex w-10 items-center justify-center overflow-hidden rounded-lg"
                        style={{ aspectRatio: '4/5' }}
                    >
                        <img
                            src={url}
                            alt={row.original.title ?? row.original.asin}
                            className="h-[200%] w-[200%] max-w-none object-contain"
                        />
                    </div>
                ) : (
                    <div
                        className="flex w-10 items-center justify-center rounded-lg bg-muted"
                        style={{ aspectRatio: '4/5' }}
                    >
                        <span className="text-[10px] text-muted-foreground">N/A</span>
                    </div>
                );
            },
            enableSorting: false,
            header: '',
            size: 56,
        },
        {
            accessorKey: 'asin',
            cell: ({ row }) => (
                <span className="font-mono text-xs text-muted-foreground">
                    {row.getValue('asin')}
                </span>
            ),
            header: 'ASIN',
            size: 120,
        },
        {
            accessorKey: 'title',
            cell: ({ row }) => {
                const brand = row.original.brand;
                return (
                    <div className="min-w-0">
                        <span className="line-clamp-1 text-sm font-medium text-foreground">
                            {row.getValue('title') ?? 'Untitled'}
                        </span>
                        <span className="line-clamp-1 text-xs font-semibold text-muted-foreground">
                            {brand ?? 'No Brand'}
                        </span>
                    </div>
                );
            },
            header: 'Product',
            meta: { flex: true },
        },
        {
            accessorKey: 'rootCategoryBsr',
            cell: ({ row }) => {
                const bsr = row.getValue('rootCategoryBsr') as number | null;
                if (bsr === null) {
                    return <span className="text-sm text-muted-foreground/50">-</span>;
                }
                return (
                    <Badge variant={getBsrBadgeVariant(bsr)}>
                        <span
                            aria-hidden="true"
                            className={cn(
                                'size-1.5 rounded-full',
                                bsr <= 1000
                                    ? 'bg-emerald-500'
                                    : bsr <= 10000
                                      ? 'bg-blue-500'
                                      : bsr <= 100000
                                        ? 'bg-amber-500'
                                        : 'bg-muted-foreground/64'
                            )}
                        />
                        #{bsr.toLocaleString()}
                    </Badge>
                );
            },
            header: 'BSR',
            meta: { align: 'right' },
            size: 130,
        },
        {
            accessorKey: 'marketplaceId',
            cell: ({ row }) => {
                const id = row.getValue('marketplaceId') as string;
                return <span className="text-sm">{MARKETPLACE_FLAGS[id] ?? id}</span>;
            },
            header: 'Mkt',
            meta: { align: 'right' },
            size: 60,
        },
        {
            accessorKey: 'lastFetched',
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatRelativeTime(row.getValue('lastFetched'))}
                </span>
            ),
            header: 'Updated',
            invertSorting: true,
            meta: { align: 'right' },
            size: 90,
        },
        {
            id: 'history',
            cell: ({ row }) => {
                const rowKey = `${row.original.marketplaceId}:${row.original.asin}`;
                return (
                    <div className="flex items-center justify-end">
                        <RowHistoryButton
                            asin={row.original.asin}
                            marketplaceId={row.original.marketplaceId}
                            title={row.original.title}
                            isActive={selectedHistoryKey === rowKey}
                            onSelect={onSelectHistory}
                        />
                    </div>
                );
            },
            enableSorting: false,
            header: 'History',
            meta: { align: 'right' },
            size: 140,
        },
    ];
};

const Colgroup = ({ widths }: { widths: Array<number | undefined> }) => (
    <colgroup>
        {widths.map((width, index) => (
            <col
                key={index}
                style={width ? { width, maxWidth: width } : undefined}
            />
        ))}
    </colgroup>
);

export function RecentProducts() {
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = api.api.app.recentProducts.useInfiniteQuery(
        { limit: 50 },
        {
            getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
        }
    );

    const [sorting, setSorting] = useState<SortingState>([
        { desc: false, id: 'lastFetched' },
    ]);

    const [tooltip, setTooltip] = useState<{
        url: string;
        title: string;
        x: number;
        y: number;
    } | null>(null);
    const [selectedHistoryProduct, setSelectedHistoryProduct] =
        useState<SelectedHistoryProduct | null>(null);
    const [isHistorySheetOpen, setIsHistorySheetOpen] = useState(false);

    const tooltipRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const products = useMemo(
        () => data?.pages.flatMap(page => page.items) ?? [],
        [data]
    );

    const selectedHistoryKey = selectedHistoryProduct
        ? `${selectedHistoryProduct.marketplaceId}:${selectedHistoryProduct.asin}`
        : null;

    const handleSelectHistory = useCallback((product: SelectedHistoryProduct) => {
        setSelectedHistoryProduct(product);
        setIsHistorySheetOpen(true);
    }, []);

    const columns = useMemo(
        () =>
            createColumns({
                onSelectHistory: handleSelectHistory,
                selectedHistoryKey,
            }),
        [handleSelectHistory, selectedHistoryKey]
    );

    const columnWidths = useMemo(
        () =>
            columns.map(column => {
                const meta = column.meta as { flex?: boolean } | undefined;
                if (meta?.flex) return undefined;
                return column.size;
            }),
        [columns]
    );

    useEffect(() => {
        if (!hasNextPage || isFetchingNextPage) return;
        const node = loadMoreRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            entries => {
                const [entry] = entries;
                if (!entry?.isIntersecting) return;
                if (!hasNextPage || isFetchingNextPage) return;
                fetchNextPage();
            },
            {
                rootMargin: '240px 0px',
            }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const table = useReactTable({
        columns,
        data: products,
        enableSortingRemoval: false,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onSortingChange: setSorting,
        state: { sorting },
    });

    if (isLoading) {
        return (
            <Frame className="bg-[#FCFCFC]">
                <div className="space-y-1 p-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <div
                            key={index}
                            className="h-10 animate-pulse rounded-lg bg-muted"
                        />
                    ))}
                </div>
            </Frame>
        );
    }

    return (
        <>
            <div className="flex h-full flex-col gap-3">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-[#FCFCFC]">
                    <table className="w-full shrink-0 text-sm" style={{ tableLayout: 'fixed' }}>
                        <Colgroup widths={columnWidths} />
                        <TableHeader className="[&_tr]:border-b-border">
                            {table.getHeaderGroups().map(headerGroup => (
                                <TableRow
                                    className="hover:bg-transparent"
                                    key={headerGroup.id}
                                >
                                    {headerGroup.headers.map(header => {
                                        const meta = header.column.columnDef.meta as
                                            | { align?: string }
                                            | undefined;
                                        const isRight = meta?.align === 'right';
                                        return (
                                            <TableHead
                                                key={header.id}
                                                className={isRight ? 'text-right' : undefined}
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : header.column.getCanSort()
                                                      ? (
                                                            <div
                                                                className={cn(
                                                                    'flex h-full cursor-pointer select-none items-center gap-2',
                                                                    isRight
                                                                        ? 'justify-end'
                                                                        : 'justify-between'
                                                                )}
                                                                onClick={header.column.getToggleSortingHandler()}
                                                                onKeyDown={event => {
                                                                    if (
                                                                        event.key === 'Enter' ||
                                                                        event.key === ' '
                                                                    ) {
                                                                        event.preventDefault();
                                                                        header.column.getToggleSortingHandler()?.(
                                                                            event
                                                                        );
                                                                    }
                                                                }}
                                                                role="button"
                                                                tabIndex={0}
                                                            >
                                                                {flexRender(
                                                                    header.column.columnDef
                                                                        .header,
                                                                    header.getContext()
                                                                )}
                                                                {{
                                                                    asc: (
                                                                        <ChevronUpIcon
                                                                            aria-hidden="true"
                                                                            className="size-4 shrink-0 opacity-80"
                                                                        />
                                                                    ),
                                                                    desc: (
                                                                        <ChevronDownIcon
                                                                            aria-hidden="true"
                                                                            className="size-4 shrink-0 opacity-80"
                                                                        />
                                                                    ),
                                                                }[
                                                                    header.column.getIsSorted() as string
                                                                ] ?? null}
                                                            </div>
                                                        )
                                                      : flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                            </TableHead>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableHeader>
                    </table>

                    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
                        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                            <Colgroup widths={columnWidths} />
                            <TableBody>
                                {table.getRowModel().rows.length ? (
                                    table.getRowModel().rows.map(row => {
                                        const rowKey = `${row.original.marketplaceId}:${row.original.asin}`;
                                        const isSelectedRow = rowKey === selectedHistoryKey;
                                        const imageUrl = row.original.thumbnailUrl;

                                        return (
                                            <TableRow
                                                key={row.id}
                                                className={cn(
                                                    isSelectedRow &&
                                                        'bg-[#F4EFE7] hover:bg-[#F4EFE7]'
                                                )}
                                                onMouseMove={event => {
                                                    if (!imageUrl) return;
                                                    setTooltip({
                                                        url: imageUrl,
                                                        title:
                                                            row.original.title ?? row.original.asin,
                                                        x: event.clientX,
                                                        y: event.clientY,
                                                    });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                            >
                                                {row.getVisibleCells().map(cell => {
                                                    const meta = cell.column.columnDef.meta as
                                                        | { align?: string }
                                                        | undefined;
                                                    const isRight = meta?.align === 'right';
                                                    return (
                                                        <TableCell
                                                            key={cell.id}
                                                            className={isRight ? 'text-right' : undefined}
                                                        >
                                                            {flexRender(
                                                                cell.column.columnDef.cell,
                                                                cell.getContext()
                                                            )}
                                                        </TableCell>
                                                    );
                                                })}
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell
                                            className="h-24 text-center text-muted-foreground"
                                            colSpan={columns.length}
                                        >
                                            No products scanned yet. Search an ASIN above.
                                        </TableCell>
                                    </TableRow>
                                )}

                                {isFetchingNextPage &&
                                    Array.from({ length: 3 }).map((_, index) => (
                                        <TableRow key={`loading-row-${index}`}>
                                            <TableCell colSpan={columns.length}>
                                                <div className="h-8 animate-pulse rounded-md bg-muted" />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </table>

                        {hasNextPage && (
                            <div
                                ref={loadMoreRef}
                                aria-hidden="true"
                                className="h-1 w-full"
                            />
                        )}
                    </div>

                    {products.length > 0 && (
                        <div className="shrink-0 border-t border-border bg-muted/50 px-4 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm text-muted-foreground">
                                    Loaded{' '}
                                    <strong className="font-medium text-foreground">
                                        {products.length}
                                    </strong>{' '}
                                    products
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {hasNextPage
                                        ? 'Scroll to load more'
                                        : 'All products loaded'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

            </div>

            {tooltip &&
                createPortal(
                    <div
                        ref={tooltipRef}
                        className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-border bg-white shadow-lg"
                        style={{
                            left:
                                tooltip.x + 220 > window.innerWidth
                                    ? tooltip.x - 220
                                    : tooltip.x + 16,
                            top:
                                tooltip.y + 280 > window.innerHeight
                                    ? tooltip.y - 280
                                    : tooltip.y + 16,
                        }}
                    >
                        <img
                            src={tooltip.url}
                            alt={tooltip.title}
                            className="block h-auto w-[200px]"
                        />
                    </div>,
                    document.body
                )}

            <Sheet
                open={isHistorySheetOpen}
                onOpenChange={open => {
                    setIsHistorySheetOpen(open);
                    if (!open) {
                        setSelectedHistoryProduct(null);
                    }
                }}
            >
                <SheetPopup side="right" variant="inset" className="p-0">
                    <SheetPanel className="h-full p-0">
                        {selectedHistoryProduct && (
                            <ProductHistoryPanel
                                key={selectedHistoryKey}
                                product={selectedHistoryProduct}
                            />
                        )}
                    </SheetPanel>
                </SheetPopup>
            </Sheet>
        </>
    );
}
