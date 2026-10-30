import type { MouseEvent, PointerEvent, ReactNode } from 'react';

/**
 * Makes a grid's rows open like links: ⌘/Ctrl-click and middle-click open the
 * row's page in a new tab, Shift-click in a new window. DataGrid rows take no
 * `href`, so this wraps the grid (`display: contents`, no layout box) and
 * re-dispatches the click on a real anchor, which the browser opens with the
 * same modifiers. A plain click is left to the row action.
 */
export const GridRowLinks = ({
    children,
    hrefOf,
}: {
    children: ReactNode;
    /** A row key's page, or `undefined` for a row that opens nothing. */
    hrefOf: (key: string) => string | undefined;
}) => {
    const rowHref = (event: MouseEvent | PointerEvent) => {
        if (!(event.target instanceof Element) || event.target.closest('a[href]')) {
            return undefined;
        }
        const key = event.target.closest('.table__body [role="row"]')?.getAttribute('data-key');
        return key ? hrefOf(key) : undefined;
    };

    // Held back from the row so its press neither opens the row here nor moves the selection.
    const handlePointerDown = (event: PointerEvent) => {
        if (opensElsewhere(event) && rowHref(event)) {
            event.stopPropagation();
        }
    };
    const handleClick = (event: MouseEvent) => {
        const href = opensElsewhere(event) ? rowHref(event) : undefined;
        if (href) {
            event.preventDefault();
            event.stopPropagation();
            openLink(href, event);
        }
    };

    return (
        <div
            className="contents"
            onAuxClick={handleClick}
            onClickCapture={handleClick}
            onPointerDownCapture={handlePointerDown}
        >
            {children}
        </div>
    );
};

/** A click the browser would open in another tab or window. */
const opensElsewhere = (event: MouseEvent | PointerEvent) =>
    event.button === 1 ||
    (event.button === 0 && (event.metaKey || event.ctrlKey || event.shiftKey));

/**
 * Clicks a real anchor with the same modifiers, so the browser decides tab or
 * window. A middle click is replayed as the platform's new-tab click.
 */
const openLink = (href: string, event: MouseEvent) => {
    const isMiddle = event.button === 1;
    const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
    const link = document.createElement('a');
    link.href = href;
    link.hidden = true;
    document.body.append(link);
    link.dispatchEvent(
        new window.MouseEvent('click', {
            altKey: event.altKey,
            cancelable: true,
            ctrlKey: event.ctrlKey || (isMiddle && !isMac),
            metaKey: event.metaKey || (isMiddle && isMac),
            shiftKey: event.shiftKey,
        })
    );
    link.remove();
};
