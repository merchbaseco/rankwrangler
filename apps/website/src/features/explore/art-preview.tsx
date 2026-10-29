import type { ReactNode } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatBsr } from '@/features/bsr/bsr-format';
import { classifyBsr, tierClassName } from '@/features/bsr/bsr-tier';
import { cn } from '@/lib/utils';

/**
 * A row thumbnail that opens a 240px mouse-following preview of the whole
 * design (the existing CursorTooltip: no delay, no enter motion): the art on
 * the well, then its short name and BSR. Merch is sold on the print, so a
 * row's small crop always has the full view one hover away.
 */
export const ArtPreview = ({
    children,
    name,
    salesRank,
    src,
}: {
    children: ReactNode;
    name: string;
    salesRank: number | null;
    src: string | null;
}) =>
    src ? (
        <CursorTooltip
            content={
                <span className="art-preview">
                    <span className="art-preview__art">
                        <img alt="" draggable={false} src={src} />
                    </span>
                    <span className="truncate font-sans font-semibold">{name}</span>
                    <span className={cn('tier-figure', tierClassName(classifyBsr(salesRank)))}>
                        <span aria-hidden className="tier-swatch" />
                        {formatBsr(salesRank)}
                    </span>
                </span>
            }
            triggerClassName="inline-flex"
        >
            {children}
        </CursorTooltip>
    ) : (
        children
    );
