export interface DotMatrixGeometry {
    /** The unlit dots as one path (drawn in `--dot-off`, transparent on paper). */
    readonly off: string;
    /** Lit dots grouped by key (a tier, a heat), in first-seen order, one path each. */
    readonly on: readonly { readonly key: string; readonly d: string }[];
    readonly viewBox: string;
    /** Columns drawn, so callers can map a pointer x back to a value. */
    readonly columns: number;
}

/**
 * The KPI cells' dot-matrix band (Grid J/K/I): values in 0..1 laid into a
 * grid of dots `gap` apart, each column lit from the bottom up to its value
 * (at least one dot when the value is present). More columns than values
 * repeat a value across its share of the width; a null value leaves its
 * column unlit. `keys` colours each value's lit dots (BSR tier, keyword heat).
 */
export const dotMatrixGeometry = (
    values: readonly (number | null)[],
    {
        gap = 6,
        height,
        keys,
        radius = 1.5,
        width,
    }: {
        gap?: number;
        height: number;
        keys?: readonly string[];
        radius?: number;
        width: number;
    }
): DotMatrixGeometry => {
    const columns = Math.floor(width / gap);
    const rows = Math.floor(height / gap);
    const lit = new Map<string, string>();
    let off = '';
    for (let column = 0; column < columns && values.length > 0; column++) {
        const index = Math.min(values.length - 1, Math.floor((column * values.length) / columns));
        const value = values[index];
        const key = keys?.[index] ?? 'on';
        const litRows =
            value === null || value === undefined
                ? 0
                : Math.max(1, Math.round(Math.min(1, Math.max(0, value)) * rows));
        for (let row = 0; row < rows; row++) {
            const dot = circle((column + 0.5) * gap, height - (row + 0.5) * gap, radius);
            if (row < litRows) {
                lit.set(key, (lit.get(key) ?? '') + dot);
            } else {
                off += dot;
            }
        }
    }
    return {
        columns,
        off,
        on: [...lit].map(([key, d]) => ({ d, key })),
        viewBox: `0 0 ${width} ${height}`,
    };
};

/**
 * Which value a pointer x (in drawing units) reads on a band: the dot column
 * under it, mapped back to the value that column draws. Null off the band.
 */
export const bandValueIndex = (
    x: number,
    { columns, count, gap = 6 }: { columns: number; count: number; gap?: number }
): number | null => {
    if (count === 0 || columns === 0 || x < 0) {
        return null;
    }
    const column = Math.min(columns - 1, Math.floor(x / gap));
    return Math.min(count - 1, Math.floor((column * count) / columns));
};

/**
 * Counts scaled for a band: each over the largest, square-rooted so a long
 * tail still shows a dot where a linear scale would round it away.
 */
export const bandLevels = (counts: readonly number[]): number[] => {
    const max = Math.max(0, ...counts);
    return counts.map(count => (max > 0 ? Math.sqrt(count / max) : 0));
};

/**
 * A series scaled min to max into 0.12..1 (Grid I `norm`), so a flat stretch
 * still shows its floor of dots and the best week fills the column.
 */
export const seriesLevels = (values: readonly number[]): number[] => {
    if (values.length === 0) {
        return [];
    }
    const low = Math.min(...values);
    const spread = Math.max(...values) - low;
    return values.map(
        value => floorLevel + (1 - floorLevel) * (spread > 0 ? (value - low) / spread : 1)
    );
};

const floorLevel = 0.12;

/**
 * A share (0..1) as a left-to-right meter for a band: lit full-height columns
 * up to the share, unlit after; nothing when the share is unknown.
 */
export const bandMeter = (share: number | null, columns = 100): (number | null)[] =>
    share === null
        ? []
        : Array.from({ length: columns }, (_, index) =>
              index < Math.round(Math.min(1, Math.max(0, share)) * columns) ? 1 : null
          );

const circle = (x: number, y: number, r: number) =>
    `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
