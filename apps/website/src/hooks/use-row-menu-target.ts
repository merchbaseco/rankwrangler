import { type KeyboardEvent, type MouseEvent, type SyntheticEvent, useState } from 'react';

/**
 * Which grid row a table-wide ContextMenu acts on. DataGrid rows expose no
 * per-row wrapper, so one ContextMenu.Trigger wraps the grid and a cell in each
 * row carries `rowIdAttribute`. The row is resolved from the event target
 * before the menu opens:
 *
 * - a right-click targets the cell under the pointer;
 * - Shift+F10 or the Menu key fire `contextmenu` on the focused row or cell,
 *   so grid keyboard focus picks the row (rows are already in the tab order,
 *   which is why the trigger itself takes no `tabIndex`);
 * - Control+Enter on macOS opens through React Aria's keydown fallback where
 *   the browser fires no `contextmenu`, so the keydown resolves it too.
 *
 * When no row is found (header, empty state) the event stops at the trigger
 * and the browser's own menu shows instead.
 */
export const useRowMenuTarget = <T>(
    rowIdAttribute: string,
    resolve: (id: string) => T | undefined
) => {
    const [target, setTarget] = useState<T | null>(null);

    const pick = (event: SyntheticEvent) => {
        const id = findRowId(event.target, rowIdAttribute);
        const row = id ? resolve(id) : undefined;
        if (row === undefined) {
            event.stopPropagation();
            return;
        }
        setTarget(row);
    };

    const triggerProps = {
        onContextMenuCapture: (event: MouseEvent<HTMLDivElement>) => pick(event),
        onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.ctrlKey && event.key === 'Enter') {
                pick(event);
            }
        },
    };

    return { target, triggerProps };
};

const findRowId = (target: EventTarget, attribute: string) => {
    if (!(target instanceof Element)) {
        return null;
    }
    // `[role="row"]` rather than `tr`: a virtualized DataGrid renders rows as divs.
    const row = target.closest('[role="row"]');
    return row?.querySelector(`[${attribute}]`)?.getAttribute(attribute) ?? null;
};
