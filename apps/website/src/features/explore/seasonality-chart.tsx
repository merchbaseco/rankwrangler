import { type PointerEvent, useId, useMemo, useState } from 'react';
import { CursorTooltip } from '@/components/ui/cursor-tooltip';
import { formatCompact } from '@/features/bsr/bsr-format';
import { useElementWidth } from '@/hooks/use-element-width';
import {
    perDesign,
    type Season,
    type SeasonGeometry,
    seasonGeometry,
    seasonWeekAt,
    seasonWeekLabel,
} from './seasonality-geometry';

/**
 * A keyword's last year at a glance, in the Grid direction's halftone: the
 * weekly sales-strength line over a dotted fill, month names under it. The
 * pointer reads the week under it. It measures its width and draws at that
 * pixel size so the dots stay round; its frame caps the width so the dot
 * texture never runs on too long.
 */
export const SeasonalityChart = ({ height, season }: { height: number; season: Season }) => {
    const { ref, width } = useElementWidth<HTMLDivElement>();
    const geometry = useMemo(
        () => (width > 0 ? seasonGeometry(season, { height, width }) : null),
        [season, height, width]
    );
    const [hovered, setHovered] = useState<number | null>(null);
    // A fragment-safe id prefix: React's ids carry punctuation `url(#…)` would need escaping.
    const id = `season${useId().replace(nonWord, '')}`;
    const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
        if (geometry) {
            const bounds = event.currentTarget.getBoundingClientRect();
            setHovered(seasonWeekAt(event.clientX - bounds.left, geometry));
        }
    };
    const cursor = hovered === null ? null : geometry?.points[hovered];
    return (
        <div className="season-chart band-ink-elite" ref={ref}>
            {geometry ? (
                <CursorTooltip
                    content={
                        hovered === null ? null : (
                            <WeekTip geometry={geometry} season={season} week={hovered} />
                        )
                    }
                    triggerClassName="block"
                >
                    <svg
                        aria-label="Weekly sales strength over the last year"
                        height={height}
                        onPointerLeave={() => setHovered(null)}
                        onPointerMove={handlePointerMove}
                        role="img"
                        viewBox={`0 0 ${width} ${height}`}
                        width={width}
                    >
                        <defs>
                            <pattern
                                height={3}
                                id={`${id}-dots`}
                                patternUnits="userSpaceOnUse"
                                width={3}
                            >
                                <circle className="halftone-spark__dot" cx={1.5} cy={1.5} />
                            </pattern>
                        </defs>
                        <path d={geometry.area} fill={`url(#${id}-dots)`} />
                        <path className="season-chart__line" d={geometry.line} />
                        {geometry.xTicks.map(tick => (
                            <text
                                className="season-chart__tick"
                                key={tick.x}
                                textAnchor="middle"
                                x={tick.x}
                                y={height - 4}
                            >
                                {tick.label}
                            </text>
                        ))}
                        {cursor ? (
                            <line
                                className="season-chart__cursor"
                                x1={cursor.x}
                                x2={cursor.x}
                                y1={geometry.plot.top}
                                y2={geometry.plot.bottom}
                            />
                        ) : null}
                        {cursor && cursor.y !== null ? (
                            <circle className="season-chart__hover" cx={cursor.x} cy={cursor.y} r={3} />
                        ) : null}
                    </svg>
                </CursorTooltip>
            ) : null}
        </div>
    );
};

/** The week under the pointer: its strength as drawn, then the sales behind it. */
const WeekTip = ({
    geometry,
    season,
    week,
}: {
    geometry: SeasonGeometry;
    season: Season;
    week: number;
}) => {
    const entry = season.weeks[week];
    const strength = geometry.strength[week];
    const sales = perDesign(entry);
    if (!entry) {
        return null;
    }
    return (
        <span className="flex flex-col">
            <span className="font-semibold">Week of {seasonWeekLabel(entry.start, true)}</span>
            <span className="text-muted">
                {strength === null || strength === undefined || sales === null
                    ? 'No ranked designs'
                    : `Strength ${Math.round(strength)} · ~${formatCompact(Math.round(sales))} sales a design · ${entry.designs} designs`}
            </span>
        </span>
    );
};

const nonWord = /\W/g;
