import { type PointerEvent, type ReactNode, useId, useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatBsr, formatShortDate } from './bsr-format';
import { type BsrTier, tierClassName } from './bsr-tier';
import { type HalftoneGeometry, halftoneGeometry } from './halftone-geometry';
import { nearestSampleIndex, type RankPoint } from './sparkline-geometry';

/**
 * A row's 30-day rank as a halftone area (OptsL option 4): the exact 1.5px
 * line over a dotted fill in the tier's halftone ink (`--tier-ht`, darker on
 * paper), a dot on the latest sample, and the nearest day in a cursor
 * tooltip. Renders nothing without a ranked sample.
 */
export const HalftoneSparkline = ({
    height = 32,
    series,
    tier,
    width = 104,
}: {
    height?: number;
    /** Daily samples oldest first, e.g. `product.search` `bsr30d`. */
    series: readonly RankPoint[];
    tier: BsrTier;
    width?: number;
}) => {
    const ranked = useMemo(() => series.filter(point => point.salesRank > 0), [series]);
    const geometry = useMemo(
        () => halftoneGeometry(ranked, { height, width }),
        [ranked, height, width]
    );
    const latest = ranked.at(-1);
    return (
        <HalftoneArea
            geometry={geometry}
            height={height}
            inkClass={tierClassName(tier)}
            label={latest ? `30-day BSR, latest ${formatBsr(latest.salesRank)}` : '30-day BSR'}
            tooltip={index => {
                const point = ranked[index];
                return point ? (
                    <span>
                        <span className="font-mono">{formatBsr(point.salesRank)}</span>
                        <span className="text-muted"> · {formatShortDate(point.at)}</span>
                    </span>
                ) : null;
            }}
            width={width}
        />
    );
};

/**
 * The drawing: a 3-unit dot pattern (radius `--halftone-dot`, so
 * paper gets slightly larger dots) filling the area, the line and end dot on
 * top, all in `--halftone-ink` from `inkClass`. Drawn at its viewBox size so
 * the dots stay round.
 */
const HalftoneArea = ({
    geometry,
    height,
    inkClass,
    label,
    tooltip,
    width,
}: {
    geometry: HalftoneGeometry | null;
    height: number;
    inkClass: string;
    label: string;
    tooltip: (index: number) => ReactNode;
    width: number;
}) => {
    // A fragment-safe id: React's ids carry punctuation `url(#…)` would need escaping.
    const pattern = `halftone${useId().replace(nonWord, '')}`;
    const [hovered, setHovered] = useState<number | null>(null);
    if (!geometry) {
        return null;
    }
    const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setHovered(
            nearestSampleIndex(geometry.xs, ((event.clientX - bounds.left) / bounds.width) * width)
        );
    };
    return (
        <CursorTooltip
            content={tooltip(hovered ?? geometry.xs.length - 1)}
            triggerClassName={`inline-flex shrink-0 ${inkClass}`}
        >
            <svg
                aria-label={label}
                className="halftone-spark"
                height={height}
                onPointerLeave={() => setHovered(null)}
                onPointerMove={handlePointerMove}
                role="img"
                viewBox={`0 0 ${width} ${height}`}
                width={width}
            >
                <defs>
                    <pattern height={3} id={pattern} patternUnits="userSpaceOnUse" width={3}>
                        <circle className="halftone-spark__dot" cx={1.5} cy={1.5} />
                    </pattern>
                </defs>
                <path d={geometry.area} fill={`url(#${pattern})`} />
                <path
                    className="halftone-spark__line"
                    d={geometry.line}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                />
                <circle
                    className="halftone-spark__end"
                    cx={geometry.end.x}
                    cy={geometry.end.y}
                    r={2.2}
                />
            </svg>
        </CursorTooltip>
    );
};

const nonWord = /\W/g;
