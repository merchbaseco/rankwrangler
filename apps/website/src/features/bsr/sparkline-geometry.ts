export interface RankPoint {
    /** ISO timestamp of the sample. */
    readonly at: string;
    readonly salesRank: number;
}

export interface SparklineGeometry {
    /** `x,y x,y …` for an SVG polyline. */
    readonly points: string;
    readonly end: { readonly x: number; readonly y: number };
    /** Each sample's x, in viewBox units, for hit-testing the pointer. */
    readonly xs: readonly number[];
}

/**
 * Lays a rank series into a `width × height` viewBox with `inset` padding
 * (or `insetX` / `insetY` apart: the card sparkline runs x 2–70, y 4–30).
 * Rank is plotted on a log scale and inverted, so a better (lower) rank sits
 * higher and a flat line means steady sales. Returns null for an empty series;
 * a single sample draws a flat line.
 */
export const sparklineGeometry = (
    series: readonly RankPoint[],
    {
        height,
        inset = 3,
        insetX = inset,
        insetY = inset,
        width,
    }: { height: number; inset?: number; insetX?: number; insetY?: number; width: number }
): SparklineGeometry | null => {
    const logs = series
        .filter(point => point.salesRank > 0)
        .map(point => Math.log(point.salesRank));
    if (logs.length === 0) {
        return null;
    }
    const low = Math.min(...logs);
    const high = Math.max(...logs);
    const spread = high - low || 1;
    const innerWidth = width - insetX * 2;
    const innerHeight = height - insetY * 2;
    const step = logs.length > 1 ? innerWidth / (logs.length - 1) : 0;
    const coordinates = logs.map((value, index) => ({
        x: logs.length > 1 ? insetX + index * step : insetX + innerWidth / 2,
        y: high === low ? height / 2 : insetY + ((value - low) / spread) * innerHeight,
    }));
    const single = coordinates.length === 1 ? coordinates[0] : undefined;
    const drawn = single
        ? [
              { x: insetX, y: single.y },
              { x: width - insetX, y: single.y },
          ]
        : coordinates;
    const end = drawn.at(-1) ?? { x: width - insetX, y: height / 2 };
    return {
        end,
        points: drawn.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
        xs: coordinates.map(point => point.x),
    };
};

/** Index of the sample nearest a viewBox x. */
export const nearestSampleIndex = (xs: readonly number[], x: number): number => {
    let best = 0;
    for (let index = 1; index < xs.length; index += 1) {
        if (Math.abs((xs[index] ?? 0) - x) < Math.abs((xs[best] ?? 0) - x)) {
            best = index;
        }
    }
    return best;
};
