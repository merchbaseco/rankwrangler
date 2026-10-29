import { Tooltip } from '@heroui/react';
import { type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const viewportPadding = 12;

/**
 * A stock HeroUI Tooltip that follows the mouse across its trigger, for dense
 * data marks (shelf blocks, sparklines, tier tiles) where a tooltip pinned to
 * the trigger's edge would sit far from what the pointer is reading. React Aria
 * still owns the anchor, portal, and collision handling; the `cursor-tooltip`
 * theme rule (theme/overrides.css) adds the pointer offset through the
 * individual `translate` property. Port of Haus `cursor-hover-card.tsx`.
 *
 * The trigger stays out of the tab order (a dense table would otherwise get a
 * stop per mark) but keeps its semantics, so the open tooltip still describes
 * it. A mark whose tooltip carries information the screen reader needs puts
 * that text in its own accessible name too.
 */
export const CursorTooltip = ({
    children,
    content,
    onOpenChange,
    triggerClassName,
}: {
    children: ReactNode;
    content: ReactNode;
    onOpenChange?: (open: boolean) => void;
    /**
     * Layout for the trigger wrapper itself. The wrapper is a real box in its
     * parent's layout, so a trigger inside a flex row needs `min-w-0` on it —
     * the class cannot reach from inside `children`.
     */
    triggerClassName?: string;
}) => {
    const [open, setOpen] = useState(false);
    const contentRef = useRef<HTMLElement | null>(null);
    const pointerRef = useRef<CursorPositionInput | null>(null);
    const repositionFrameRef = useRef<number | null>(null);
    const triggerRef = useRef<HTMLSpanElement>(null);
    const offsetRef = useRef({ x: 0, y: 0 });

    useEffect(
        () => () => {
            if (repositionFrameRef.current !== null) {
                window.cancelAnimationFrame(repositionFrameRef.current);
            }
        },
        []
    );

    const applyOffset = useCallback((x: number, y: number) => {
        offsetRef.current = { x, y };
        contentRef.current?.style.setProperty('--cursor-tooltip-x', `${x}px`);
        contentRef.current?.style.setProperty('--cursor-tooltip-y', `${y}px`);
    }, []);

    const applyPointerOffset = useCallback(
        (input: CursorPositionInput) => {
            const surface = contentRef.current?.getBoundingClientRect();
            const current = offsetRef.current;
            const offset = getCursorTooltipOffset({
                ...input,
                surfaceBounds: surface
                    ? {
                          bottom: surface.bottom - current.y,
                          left: surface.left - current.x,
                          right: surface.right - current.x,
                          top: surface.top - current.y,
                      }
                    : undefined,
                viewport: surface
                    ? { height: window.innerHeight, width: window.innerWidth }
                    : undefined,
            });
            applyOffset(offset.x, offset.y);
        },
        [applyOffset]
    );

    const resetOffset = useCallback(() => {
        pointerRef.current = null;
        applyOffset(0, 0);
    }, [applyOffset]);

    const handlePointerMove = useCallback(
        (event: PointerEvent<HTMLSpanElement>) => {
            if (event.pointerType !== 'mouse') {
                resetOffset();
                return;
            }
            const bounds = triggerRef.current?.getBoundingClientRect();
            if (!bounds) {
                return;
            }
            const input = { bounds, clientX: event.clientX, clientY: event.clientY };
            pointerRef.current = input;
            applyPointerOffset(input);
        },
        [applyPointerOffset, resetOffset]
    );

    const handleOpenChange = useCallback(
        (next: boolean) => {
            setOpen(next);
            onOpenChange?.(next);
        },
        [onOpenChange]
    );

    const attachContent = useCallback(
        (element: HTMLElement | null) => {
            if (repositionFrameRef.current !== null) {
                window.cancelAnimationFrame(repositionFrameRef.current);
                repositionFrameRef.current = null;
            }
            contentRef.current = element;
            if (!element) {
                return;
            }
            element.style.setProperty('--cursor-tooltip-x', `${offsetRef.current.x}px`);
            element.style.setProperty('--cursor-tooltip-y', `${offsetRef.current.y}px`);
            // The surface has no size until it lays out; measure on the next frame.
            repositionFrameRef.current = window.requestAnimationFrame(() => {
                repositionFrameRef.current = null;
                const pointer = pointerRef.current;
                if (pointer && contentRef.current === element) {
                    applyPointerOffset(pointer);
                }
            });
        },
        [applyPointerOffset]
    );

    return (
        <Tooltip closeDelay={0} delay={0} isOpen={open} onOpenChange={handleOpenChange}>
            <Tooltip.Trigger<'span'>
                className={cn('align-middle', triggerClassName)}
                onBlur={() => handleOpenChange(false)}
                onFocus={() => {
                    resetOffset();
                    handleOpenChange(true);
                }}
                onPointerMove={handlePointerMove}
                ref={triggerRef}
                render={props => <span {...props} />}
                tabIndex={-1}
            >
                {children}
            </Tooltip.Trigger>
            <Tooltip.Content
                className="cursor-tooltip"
                offset={10}
                placement="bottom start"
                ref={attachContent}
            >
                {content}
            </Tooltip.Content>
        </Tooltip>
    );
};

interface CursorPositionInput {
    bounds: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>;
    clientX: number;
    clientY: number;
}

export const getCursorTooltipOffset = ({
    bounds,
    clientX,
    clientY,
    surfaceBounds,
    viewport,
}: CursorPositionInput & {
    surfaceBounds?: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>;
    viewport?: { height: number; width: number };
}) => {
    let x = clientX + 15 - (surfaceBounds?.left ?? bounds.left);
    let y = clientY - 15 - (surfaceBounds?.bottom ?? bounds.top + bounds.height + 10);

    if (surfaceBounds && viewport) {
        x = constrainToViewport(x, {
            end: surfaceBounds.right,
            start: surfaceBounds.left,
            viewportSize: viewport.width,
        });
        y = constrainToViewport(y, {
            end: surfaceBounds.bottom,
            start: surfaceBounds.top,
            viewportSize: viewport.height,
        });
    }

    return { x: Math.round(x), y: Math.round(y) };
};

const constrainToViewport = (
    value: number,
    { end, start, viewportSize }: { end: number; start: number; viewportSize: number }
) => {
    const minimum = viewportPadding - start;
    const maximum = viewportSize - viewportPadding - end;
    if (minimum > maximum) {
        return (minimum + maximum) / 2;
    }
    return Math.min(maximum, Math.max(minimum, value));
};
