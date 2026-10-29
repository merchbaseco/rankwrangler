import { type PointerEvent, type ReactNode, useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { useElementWidth } from '@/hooks/use-element-width';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { bandValueIndex, dotMatrixGeometry } from './dot-matrix-geometry';

/**
 * A KPI cell's dot-matrix band (Grid J/K/I): values in 0..1 as columns of
 * dots lit from the bottom. Lit dots take the ink of their key's scope class
 * (`keyClass(key)`, e.g. `tier-hot` or `heat-warm`, which points
 * `--band-ink`), or `ink` for a single-series band; unlit dots draw in
 * `--dot-off`, which is transparent on paper (the light mock shows only the
 * shape). It measures the cell and draws at that pixel width, so dots stay
 * round whatever the column widths are. With `tooltip`, the pointer reads the
 * value under it (a bucket, a day) in a mouse-following tooltip.
 */
export const DotMatrixBand = ({
    height = 58,
    ink = 'accent',
    keyClass,
    keys,
    label,
    scope,
    tooltip,
    values,
}: {
    height?: number;
    /** The single-series ink (`band-ink-*`; `tier` takes the enclosing tier scope), when no `keys`. */
    ink?: 'accent' | 'steady' | 'elite' | 'tier';
    /** Maps a value's key to its scope class. */
    keyClass?: (key: string) => string;
    keys?: readonly string[];
    /** Accessible description; omit for a band its KPI figure already states. */
    label?: string;
    /** A scope class on the band (a `tier-*` for `ink="tier"`). */
    scope?: string;
    /** What the value at an index means ("#2,501–#4,000 · Hot · 12 designs"). */
    tooltip?: (index: number) => ReactNode;
    values: readonly (number | null)[];
}) => {
    const [hovered, setHovered] = useState<number | null>(null);
    const { ref, width } = useElementWidth<HTMLSpanElement>();
    // Paper draws only the lit shape, so its dots run a touch larger (Grid K).
    const radius = useTheme().resolvedTheme === 'dark' ? 1.5 : 1.9;
    const band = useMemo(
        () => dotMatrixGeometry(values, { height, keys, radius, width }),
        [values, height, keys, radius, width]
    );
    const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setHovered(
            bandValueIndex(event.clientX - bounds.left, {
                columns: band.columns,
                count: values.length,
            })
        );
    };
    const drawing = (
        <svg
            aria-hidden={label ? undefined : true}
            aria-label={label}
            className={cn('dot-band__svg', !keys && `band-ink-${ink}`)}
            height={height}
            onPointerLeave={() => setHovered(null)}
            onPointerMove={tooltip ? handlePointerMove : undefined}
            role={label ? 'img' : undefined}
            viewBox={band.viewBox}
            width={width}
        >
            <path className="dot-band__off" d={band.off} />
            {band.on.map(group => (
                <path
                    className={cn('dot-band__on', keys && keyClass?.(group.key))}
                    d={group.d}
                    key={group.key}
                />
            ))}
        </svg>
    );
    const content = tooltip ? tooltip(hovered ?? 0) : null;
    return (
        <span className={cn('dot-band', scope)} ref={ref}>
            {tooltip ? (
                <CursorTooltip content={content} triggerClassName="block">
                    {drawing}
                </CursorTooltip>
            ) : (
                drawing
            )}
        </span>
    );
};
