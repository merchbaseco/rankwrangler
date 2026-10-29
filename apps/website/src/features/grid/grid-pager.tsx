import { Label, ListBox, Pagination, Select } from '@heroui/react';
import type { ReactNode } from 'react';
import { formatCount } from '@/features/bsr/bsr-format';

/**
 * A grid's pager footer (Grid J/I): "1–50 of 84,310" leading, the previous
 * and next page around "Page 1 of 1,687" in the middle, and the page size
 * trailing, all on the stock Pagination and Select. `total` is the server's
 * count (or its estimate, marked `~`); `extra` sits before the page size.
 */
export const GridPager = <Size extends number>({
    extra,
    isEstimate = false,
    onPageChange,
    onPageSizeChange,
    page,
    pageSize,
    pageSizes,
    rowCount,
    total,
}: {
    extra?: ReactNode;
    isEstimate?: boolean;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: Size) => void;
    page: number;
    pageSize: Size;
    pageSizes: readonly Size[];
    /** Rows on this page (the last page may be short). */
    rowCount: number;
    total: number | null;
}) => {
    const pages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
    const first = rowCount > 0 ? (page - 1) * pageSize + 1 : 0;
    const last = rowCount > 0 ? first + rowCount - 1 : 0;
    const totalLabel = total === null ? '…' : `${isEstimate ? '~' : ''}${formatCount(total)}`;
    return (
        <div className="grid-pager">
            <Pagination size="sm">
                <Pagination.Summary>
                    <span className="grid-pager__figure">
                        {first === last
                            ? formatCount(first)
                            : `${formatCount(first)}–${formatCount(last)}`}
                    </span>
                    of
                    <span className="grid-pager__figure">{totalLabel}</span>
                </Pagination.Summary>
                <Pagination.Content>
                    <Pagination.Item>
                        <Pagination.Previous
                            aria-label="Previous page"
                            isDisabled={page <= 1}
                            onPress={() => onPageChange(page - 1)}
                        >
                            <Pagination.PreviousIcon />
                        </Pagination.Previous>
                    </Pagination.Item>
                    <Pagination.Item>
                        <span className="grid-pager__page">
                            Page <span className="grid-pager__figure">{formatCount(page)}</span> of{' '}
                            <span className="grid-pager__figure">
                                {pages === null ? '…' : formatCount(pages)}
                            </span>
                        </span>
                    </Pagination.Item>
                    <Pagination.Item>
                        <Pagination.Next
                            aria-label="Next page"
                            isDisabled={pages === null || page >= pages}
                            onPress={() => onPageChange(page + 1)}
                        >
                            <Pagination.NextIcon />
                        </Pagination.Next>
                    </Pagination.Item>
                </Pagination.Content>
                <span className="grid-pager__end">
                    {extra}
                    <Select
                        aria-label="Rows per page"
                        className="grid-pager__size"
                        onChange={value => {
                            const size = pageSizes.find(candidate => candidate === Number(value));
                            if (size !== undefined) {
                                onPageSizeChange(size);
                            }
                        }}
                        value={pageSize}
                        variant="secondary"
                    >
                        <Label>Rows</Label>
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {pageSizes.map(size => (
                                    <ListBox.Item id={size} key={size} textValue={String(size)}>
                                        <Label>{size}</Label>
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                </span>
            </Pagination>
        </div>
    );
};
