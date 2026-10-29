import { Button, type Selection, useMediaQuery } from '@heroui/react';
import { DataGrid } from '@heroui-pro/react';
import { type ReactNode, useMemo } from 'react';
import { useDensity } from '@/hooks/use-density';
import { responsiveLogColumns } from './log-columns';
import type { EventLogRow } from './log-model';

/**
 * The event table both Logs and System Status show. Rows are virtualized at the density's fixed
 * height, so only the visible ones are in the DOM however many pages are loaded, and older events
 * load only when asked for: an automatic load-more sentinel kept firing inside a bounded window
 * and pulled in page after page on its own.
 */
export const EventLogGrid = ({
    hasMore,
    isLoadingMore,
    logs,
    onLoadMore,
    onSelect,
    renderEmptyState,
    selectedId,
}: {
    hasMore: boolean;
    isLoadingMore: boolean;
    logs: EventLogRow[];
    onLoadMore: () => void;
    onSelect: (id: string | null) => void;
    renderEmptyState: () => ReactNode;
    selectedId: string | null;
}) => {
    const { density } = useDensity();
    const rowHeight = density === 'compact' ? compactRowPx : comfortableRowPx;
    const isWide = useMediaQuery('(min-width: 80rem)', { initializeWithValue: true });
    const isPhone = !useMediaQuery('(min-width: 48rem)', { initializeWithValue: true });
    const columns = useMemo(() => responsiveLogColumns({ isPhone, isWide }), [isPhone, isWide]);

    const handleSelectionChange = (keys: Selection) => {
        const [first] = keys === 'all' ? [] : [...keys];
        onSelect(first === undefined ? null : String(first));
    };

    return (
        <>
            <DataGrid
            aria-label="Event log"
            // Resize mode applies the column widths (fixed layout), so Message takes the rest; no
            // column is resizable.
            allowsColumnResize
            className="hairline-grid hairline-grid--fill"
            columns={columns}
            data={logs}
            getRowId={log => log.id}
            headingHeight={rowHeight}
            onSelectionChange={handleSelectionChange}
            renderEmptyState={renderEmptyState}
            rowHeight={rowHeight}
            scrollContainerClassName="overflow-y-auto"
            selectedKeys={selectedId ? new Set([selectedId]) : new Set()}
            selectionBehavior="replace"
            selectionMode="single"
            variant="secondary"
            virtualized
            />
            {hasMore ? (
                <div className="flex shrink-0 justify-center py-1">
                    <Button
                        isPending={isLoadingMore}
                        onPress={onLoadMore}
                        size="sm"
                        variant="ghost"
                    >
                        Load older events
                    </Button>
                </div>
            ) : null}
        </>
    );
};

// The grid's row heights (`--grid-row-text`) in pixels, which virtualization needs as numbers.
const comfortableRowPx = 40;
const compactRowPx = 24;
