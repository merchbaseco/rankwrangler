import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type SortingState,
    useReactTable,
} from '@tanstack/react-table';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { api } from '@/lib/trpc';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Frame, FrameFooter } from '@/components/ui/frame';
import {
    Table,
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

const getBsrBadgeVariant = (bsr: number | null) => {
    if (bsr === null) return 'outline' as const;
    if (bsr <= 1000) return 'success' as const;
    if (bsr <= 10000) return 'info' as const;
    if (bsr <= 100000) return 'warning' as const;
    return 'outline' as const;
};

const columns: ColumnDef<Product>[] = [
    // ── Left-aligned group ──
    {
        accessorKey: 'thumbnailUrl',
        cell: ({ row }) => {
            const url = row.getValue('thumbnailUrl') as string | null;
            return url ? (
                <div className="flex w-10 items-center justify-center overflow-hidden rounded-lg" style={{ aspectRatio: '4/5' }}>
                    <img
                        src={url}
                        alt={row.original.title ?? row.original.asin}
                        className="h-[200%] w-[200%] max-w-none object-contain"
                    />
                </div>
            ) : (
                <div className="flex w-10 items-center justify-center rounded-lg bg-muted" style={{ aspectRatio: '4/5' }}>
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
    },
    // ── Spacer (eats remaining width) ──
    {
        id: 'spacer',
        cell: () => null,
        enableSorting: false,
        header: '',
    },
    // ── Right-aligned group ──
    {
        accessorKey: 'rootCategoryBsr',
        cell: ({ row }) => {
            const bsr = row.getValue('rootCategoryBsr') as number | null;
            if (bsr === null) {
                return (
                    <span className="text-sm text-muted-foreground/50">—</span>
                );
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
            return (
                <span className="text-sm">
                    {MARKETPLACE_FLAGS[id] ?? id}
                </span>
            );
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
];

export function RecentProducts() {
    const { data: products, isLoading } = api.api.app.recentProducts.useQuery();

    const [sorting, setSorting] = useState<SortingState>([
        { desc: false, id: 'lastFetched' },
    ]);

    const [tooltip, setTooltip] = useState<{
        url: string;
        title: string;
        x: number;
        y: number;
    } | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    const table = useReactTable({
        columns,
        data: products ?? [],
        enableSortingRemoval: false,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        initialState: {
            pagination: { pageIndex: 0, pageSize: 100 },
        },
        onSortingChange: setSorting,
        state: { sorting },
    });

    if (isLoading) {
        return (
            <Frame className="bg-[#FCFCFC]">
                <div className="space-y-1 p-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-10 animate-pulse rounded-lg bg-muted"
                        />
                    ))}
                </div>
            </Frame>
        );
    }

    return (
        <>
        <Frame className="bg-[#FCFCFC]">
            <Table>
                <TableHeader>
                    {table.getHeaderGroups().map(headerGroup => (
                        <TableRow
                            className="hover:bg-transparent"
                            key={headerGroup.id}
                        >
                            {headerGroup.headers.map(header => {
                                const columnSize = header.column.getSize();
                                const isRight = (header.column.columnDef.meta as { align?: string })?.align === 'right';
                                return (
                                    <TableHead
                                        key={header.id}
                                        className={isRight ? 'text-right' : undefined}
                                        style={
                                            header.column.columnDef.size
                                                ? {
                                                      width: `${columnSize}px`,
                                                  }
                                                : undefined
                                        }
                                    >
                                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                                            <div
                                                className={cn(
                                                    'flex h-full cursor-pointer select-none items-center gap-2',
                                                    isRight ? 'justify-end' : 'justify-between'
                                                )}
                                                onClick={header.column.getToggleSortingHandler()}
                                                onKeyDown={e => {
                                                    if (
                                                        e.key === 'Enter' ||
                                                        e.key === ' '
                                                    ) {
                                                        e.preventDefault();
                                                        header.column.getToggleSortingHandler()?.(
                                                            e
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
                                        ) : (
                                            flexRender(
                                                header.column.columnDef.header,
                                                header.getContext()
                                            )
                                        )}
                                    </TableHead>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map(row => {
                            const imgUrl = row.original.thumbnailUrl;
                            return (
                                <TableRow
                                    key={row.id}
                                    onMouseMove={e => {
                                        if (!imgUrl) return;
                                        setTooltip({
                                            url: imgUrl,
                                            title:
                                                row.original.title ??
                                                row.original.asin,
                                            x: e.clientX,
                                            y: e.clientY,
                                        });
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                >
                                    {row.getVisibleCells().map(cell => {
                                        const isRight = (cell.column.columnDef.meta as { align?: string })?.align === 'right';
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
                </TableBody>
            </Table>
            {table.getPageCount() > 1 && (
                <FrameFooter>
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                            Viewing{' '}
                            <strong className="font-medium text-foreground">
                                {table.getState().pagination.pageIndex *
                                    table.getState().pagination.pageSize +
                                    1}
                                –
                                {Math.min(
                                    (table.getState().pagination.pageIndex + 1) *
                                        table.getState().pagination.pageSize,
                                    table.getRowCount()
                                )}
                            </strong>{' '}
                            of{' '}
                            <strong className="font-medium text-foreground">
                                {table.getRowCount()}
                            </strong>{' '}
                            products
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={!table.getCanPreviousPage()}
                                onClick={() => table.previousPage()}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                disabled={!table.getCanNextPage()}
                                onClick={() => table.nextPage()}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </FrameFooter>
            )}
        </Frame>
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
        </>
    );
}
