'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui-components/react/tooltip';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

const CURSOR_TOOLTIP_WIDTH = 208;
const CURSOR_TOOLTIP_HEIGHT = 248;
const CURSOR_TOOLTIP_OFFSET = 14;

type CursorImageTooltipState = {
    url: string;
    title: string;
};

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = (props: TooltipPrimitive.Trigger.Props) => (
    <TooltipPrimitive.Trigger data-slot='tooltip-trigger' {...props} />
);

const TooltipPopup = ({
    className,
    align = 'center',
    sideOffset = 4,
    side = 'top',
    anchor,
    children,
    ...props
}: TooltipPrimitive.Popup.Props & {
    align?: TooltipPrimitive.Positioner.Props['align'];
    side?: TooltipPrimitive.Positioner.Props['side'];
    sideOffset?: TooltipPrimitive.Positioner.Props['sideOffset'];
    anchor?: TooltipPrimitive.Positioner.Props['anchor'];
}) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
            align={align}
            anchor={anchor}
            className='z-50 transition-[top,left,right,bottom,transform] data-instant:transition-none'
            data-slot='tooltip-positioner'
            side={side}
            sideOffset={sideOffset}
        >
            <TooltipPrimitive.Popup
                className={cn(
                    'relative origin-(--transform-origin) text-balance rounded-md border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md transition-[scale,opacity] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 data-instant:duration-0',
                    className,
                )}
                data-slot='tooltip-popup'
                {...props}
            >
                {children}
            </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
);

const useCursorImageTooltip = () => {
    const [tooltip, setTooltip] = useState<CursorImageTooltipState | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const tooltipFrameRef = useRef<number | null>(null);
    const tooltipCursorRef = useRef({ x: 0, y: 0 });

    const applyTooltipPosition = useCallback(() => {
        const node = tooltipRef.current;
        if (!node) {
            return;
        }

        const { x, y } = tooltipCursorRef.current;
        const position = getCursorTooltipPosition({ cursorX: x, cursorY: y });
        node.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
    }, []);

    const queueTooltipPositionUpdate = useCallback(
        (cursorX: number, cursorY: number) => {
            tooltipCursorRef.current = { x: cursorX, y: cursorY };

            if (tooltipFrameRef.current !== null) {
                return;
            }

            tooltipFrameRef.current = window.requestAnimationFrame(() => {
                tooltipFrameRef.current = null;
                applyTooltipPosition();
            });
        },
        [applyTooltipPosition],
    );

    const hideTooltip = useCallback(() => {
        if (tooltipFrameRef.current !== null) {
            window.cancelAnimationFrame(tooltipFrameRef.current);
            tooltipFrameRef.current = null;
        }
        setTooltip(null);
    }, []);

    useEffect(() => {
        if (!tooltip) {
            return;
        }
        applyTooltipPosition();
    }, [applyTooltipPosition, tooltip]);

    useEffect(() => {
        return () => {
            if (tooltipFrameRef.current !== null) {
                window.cancelAnimationFrame(tooltipFrameRef.current);
            }
        };
    }, []);

    return {
        hideTooltip,
        queueTooltipPositionUpdate,
        setTooltip,
        tooltip,
        tooltipRef,
    };
};

const CursorImageTooltip = ({
    tooltip,
    tooltipRef,
}: {
    tooltip: CursorImageTooltipState | null;
    tooltipRef: React.RefObject<HTMLDivElement | null>;
}) => {
    if (!tooltip) {
        return null;
    }

    return createPortal(
        <div
            ref={tooltipRef}
            className='pointer-events-none fixed left-0 top-0 z-50 overflow-hidden rounded-sm border border-border bg-card shadow-md will-change-transform'
        >
            <img alt={tooltip.title} className='block w-[188px]' src={tooltip.url} />
        </div>,
        document.body,
    );
};

const getCursorTooltipPosition = ({
    cursorX,
    cursorY,
}: {
    cursorX: number;
    cursorY: number;
}) => {
    const left =
        cursorX + CURSOR_TOOLTIP_WIDTH > window.innerWidth
            ? cursorX - CURSOR_TOOLTIP_WIDTH
            : cursorX + CURSOR_TOOLTIP_OFFSET;
    const top =
        cursorY + CURSOR_TOOLTIP_HEIGHT > window.innerHeight
            ? cursorY - CURSOR_TOOLTIP_HEIGHT
            : cursorY + CURSOR_TOOLTIP_OFFSET;

    return { left, top };
};

export {
    CursorImageTooltip,
    Tooltip,
    TooltipPopup,
    TooltipProvider,
    TooltipTrigger,
    useCursorImageTooltip,
};
