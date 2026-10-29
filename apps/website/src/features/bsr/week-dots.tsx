import { type PointerEvent, useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatShortDate } from './bsr-format';
import { bandValueIndex, dotMatrixGeometry, seriesLevels } from './dot-matrix-geometry';
import type { ScorePoint } from './halftone-geometry';

/**
 * A keyword's twelve weekly scores as halftone dot columns (Grid I `12 weeks`):
 * each week a column of accent dots lit to its level, scaled min to max so the
 * shape reads; unlit dots in `--dot-off` (none on paper). Drawn at its viewBox
 * size so dots stay round; the week under the pointer (the latest by
 * default) and its score sit in a cursor tooltip. Renders nothing for an
 * empty series.
 */
export const WeekDots = ({
    height = 30,
    series,
    width = 112,
}: {
    height?: number;
    /** Weekly samples oldest first, e.g. `keywordDirectory` `scoreTrend12w`. */
    series: readonly ScorePoint[];
    width?: number;
}) => {
    const gap = height >= 24 ? 6 : 4;
    const band = useMemo(
        () =>
            dotMatrixGeometry(seriesLevels(series.map(point => point.score)), {
                gap,
                height,
                radius: gap === 6 ? 1.3 : 1,
                width,
            }),
        [series, gap, height, width]
    );
    const [hovered, setHovered] = useState<number | null>(null);
    const latest = series.at(-1);
    if (!latest) {
        return null;
    }
    const week = series[hovered ?? series.length - 1] ?? latest;
    const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setHovered(
            bandValueIndex(((event.clientX - bounds.left) / bounds.width) * width, {
                columns: band.columns,
                count: series.length,
                gap,
            })
        );
    };
    return (
        <CursorTooltip
            content={
                <span>
                    <span className="font-mono">Score {Math.round(week.score)}</span>
                    <span className="text-muted"> · week of {formatShortDate(week.at)}</span>
                </span>
            }
            triggerClassName="inline-flex shrink-0 band-ink-accent"
        >
            <svg
                aria-label={`12-week score, latest ${Math.round(latest.score)}`}
                className="dot-band__svg"
                height={height}
                onPointerLeave={() => setHovered(null)}
                onPointerMove={handlePointerMove}
                role="img"
                viewBox={band.viewBox}
                width={width}
            >
                <path className="dot-band__off" d={band.off} />
                {band.on.map(group => (
                    <path className="dot-band__on" d={group.d} key={group.key} />
                ))}
            </svg>
        </CursorTooltip>
    );
};
