import type { RankPoint } from './sparkline-geometry';

export interface ScorePoint {
    /** ISO timestamp of the sample. */
    readonly at: string;
    /** Popularity score, 0–100; higher is better. */
    readonly score: number;
}

export interface HalftoneGeometry {
    /** The exact series as an open SVG path (`M x y L x y …`), stroked at 1.5px. */
    readonly line: string;
    /** The same path closed down to the baseline, filled with the dotted pattern. */
    readonly area: string;
    /** The latest sample, marked with a dot. */
    readonly end: { readonly x: number; readonly y: number };
    /** Each drawn sample's x, in viewBox units, for hit-testing the pointer. */
    readonly xs: readonly number[];
}

/**
 * The halftone-area sparkline (OptsL option 4, the chosen row mark): an exact
 * line over a dotted fill. Rank is plotted on a log scale and inverted, so a
 * better (lower) rank sits higher; the line runs 1 unit in from the sides and
 * 3 from the top, the area closes to the bottom edge. Returns null without a
 * ranked sample; one sample draws a flat line across the box.
 */
export const halftoneGeometry = (
    series: readonly RankPoint[],
    size: { height: number; width: number }
): HalftoneGeometry | null =>
    halftoneValueGeometry(
        series.filter(point => point.salesRank > 0).map(point => -Math.log(point.salesRank)),
        size
    );

/**
 * The same drawing for any series where higher is better (a keyword's
 * weekly score): the highest value touches the top inset.
 */
export const halftoneValueGeometry = (
    values: readonly number[],
    { height, width }: { height: number; width: number }
): HalftoneGeometry | null => {
    // Plotted top-down: the best (highest) value gets the smallest y.
    const depths = values.map(value => -value);
    if (depths.length === 0 || depths.some(value => !Number.isFinite(value))) {
        return null;
    }
    const low = Math.min(...depths);
    const high = Math.max(...depths);
    const spread = high - low;
    const left = sideInset;
    const right = width - sideInset;
    const y = (value: number) =>
        spread === 0 ? height / 2 : topInset + ((value - low) / spread) * (height - verticalSpan);
    const points =
        depths.length === 1
            ? [
                  { x: left, y: y(depths[0] ?? 0) },
                  { x: right, y: y(depths[0] ?? 0) },
              ]
            : depths.map((value, index) => ({
                  x: left + (index / (depths.length - 1)) * (right - left),
                  y: y(value),
              }));
    const first = points[0] ?? { x: left, y: height / 2 };
    const end = points.at(-1) ?? first;
    const line = `M${points.map(point => `${fixed(point.x)} ${fixed(point.y)}`).join(' L')}`;
    return {
        area: `${line} L${fixed(end.x)} ${height} L${fixed(first.x)} ${height} Z`,
        end,
        line,
        xs: points.map(point => point.x),
    };
};

/** The mock's insets: 1 unit at each side, 3 above the line's best point, 4 below its worst. */
const sideInset = 1;
const topInset = 3;
const verticalSpan = 7;

const fixed = (value: number) => value.toFixed(1);
