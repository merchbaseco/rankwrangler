import { type MouseEvent, type PointerEvent, type ReactNode, useEffect, useRef } from 'react';

/**
 * Makes a grid's rows open like links: ⌘/Ctrl-click and middle-click open the
 * row's page in a new tab, Shift-click in a new window. DataGrid rows take no
 * `href`, so this wraps the grid (`display: contents`, no layout box) and
 * re-dispatches the click on a real anchor, which the browser opens with the
 * same modifiers. A plain click is left to the row action. With
 * `onRowIntent`, a row the pointer rests on is announced so its page can be
 * prefetched before the click.
 */
export const GridRowLinks = ({
    children,
    hrefOf,
    onRowIntent,
}: {
    children: ReactNode;
    /** A row key's page, or `undefined` for a row that opens nothing. */
    hrefOf: (key: string) => string | undefined;
    /** Called once the pointer has rested on a row (`ROW_INTENT_MS`). */
    onRowIntent?: (key: string) => void;
}) => {
    const intent = useRef<{ key: string; timer: number } | null>(null);
    useEffect(() => () => clearIntent(intent.current), []);

    const rowHref = (event: MouseEvent | PointerEvent) => {
        const key = rowKey(event);
        return key ? hrefOf(key) : undefined;
    };

    const handlePointerOver = (event: PointerEvent) => {
        const key = rowKey(event);
        if (!onRowIntent || key === intent.current?.key) {
            return;
        }
        clearIntent(intent.current);
        intent.current = key
            ? { key, timer: window.setTimeout(() => onRowIntent(key), ROW_INTENT_MS) }
            : null;
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
            onPointerOver={onRowIntent ? handlePointerOver : undefined}
        >
            {children}
        </div>
    );
};

/** How long the pointer rests on a row before it counts as intent (sweeps across rows do not). */
const ROW_INTENT_MS = 80;

/** The data row under an event, unless it landed on a link of its own. */
const rowKey = (event: MouseEvent | PointerEvent) => {
    if (!(event.target instanceof Element) || event.target.closest('a[href]')) {
        return undefined;
    }
    return event.target.closest('.table__body [role="row"]')?.getAttribute('data-key') ?? undefined;
};

const clearIntent = (intent: { timer: number } | null) => {
    if (intent) {
        window.clearTimeout(intent.timer);
    }
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
