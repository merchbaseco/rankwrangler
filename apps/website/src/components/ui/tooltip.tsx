'use client';

import { Tooltip as TooltipPrimitive } from '@base-ui-components/react/tooltip';

import { cn } from '@/lib/utils';

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

export { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger };
