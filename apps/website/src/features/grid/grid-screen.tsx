import { Button, Tooltip, useMediaQuery } from '@heroui/react';
import { Sheet } from '@heroui-pro/react';
import { FilterHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { Icon } from '@/components/ui/icon';

/**
 * A Grid-direction screen in the page shell (Handmade): the filter sidebar
 * straight on the shell and, past one hairline, the KPI header, grid and
 * pager filling the rest of the shell edge to edge. Below 72rem the sidebar would squeeze the figure columns,
 * so it moves into a stock left Sheet opened by `GridFiltersButton`
 * (rendered in the KPI header); the same filters render in both places.
 */
export const GridScreen = ({
    children,
    filters,
    label,
}: {
    children: ReactNode;
    filters: ReactNode;
    /** Names the screen, e.g. `Explore`. */
    label: string;
}) => {
    const isNarrow = useMediaQuery(narrowQuery, { initializeWithValue: true });
    const [isOpen, setIsOpen] = useState(false);
    return (
        <GridFiltersContext value={isNarrow ? () => setIsOpen(true) : null}>
            <section aria-label={label} className="grid-screen">
                <h1 className="sr-only">{label}</h1>
                {isNarrow ? null : (
                    <aside aria-label="Filters" className="grid-sidebar">
                        {filters}
                    </aside>
                )}
                <div className="grid-main">{children}</div>
            </section>
            {isNarrow ? (
                <Sheet isOpen={isOpen} onOpenChange={setIsOpen} placement="left">
                    <Sheet.Backdrop>
                        <Sheet.Content>
                            <Sheet.Dialog>
                                <Sheet.CloseTrigger />
                                <Sheet.Header>
                                    <Sheet.Heading>Filters</Sheet.Heading>
                                </Sheet.Header>
                                <Sheet.Body>
                                    <div className="grid-sidebar grid-sidebar--sheet">
                                        {filters}
                                    </div>
                                </Sheet.Body>
                            </Sheet.Dialog>
                        </Sheet.Content>
                    </Sheet.Backdrop>
                </Sheet>
            ) : null}
        </GridFiltersContext>
    );
};

/** Opens the filter Sheet; renders nothing while the sidebar is on screen. */
export const GridFiltersButton = () => {
    const open = useContext(GridFiltersContext);
    if (!open) {
        return null;
    }
    return (
        <Tooltip>
            <Button aria-label="Filters" isIconOnly onPress={open} size="sm" variant="ghost">
                <Icon icon={FilterHorizontalIcon} />
            </Button>
            <Tooltip.Content placement="bottom">Filters</Tooltip.Content>
        </Tooltip>
    );
};

const GridFiltersContext = createContext<(() => void) | null>(null);

/** Where the sidebar no longer fits beside the figure columns. */
const narrowQuery = '(width < 72rem)';
