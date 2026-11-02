/**
 * The keyword seasonality chart's drawing, from `product.searchSeasonality`:
 * the last 52 weeks as one line, a 0–100 strength index against the year's
 * busiest week. A week's strength is sales per ranked design, not the sum:
 * the sample is today's designs, so earlier weeks hold fewer of them, and a
 * sum would read catalog growth as demand. Weeks are smoothed over three
 * (a small sample's single week is noisy); a week with no ranked design
 * breaks the line rather than dropping it to zero.
 */

export interface SeasonWeek {
    /** The week's first day, `YYYY-MM-DD`. */
    readonly start: string;
    readonly sales: number | null;
    readonly designs: number;
}

export interface Season {
    readonly sampled: number;
    /** Oldest first. */
    readonly weeks: readonly SeasonWeek[];
}

export interface SeasonGeometry {
    readonly plot: {
        readonly left: number;
        readonly right: number;
        readonly top: number;
        readonly bottom: number;
    };
    readonly line: string;
    /** The line closed down to the floor, for its dotted fill. */
    readonly area: string;
    /** Each week's position; `y` is null where the line breaks. */
    readonly points: readonly { readonly x: number; readonly y: number | null }[];
    /** Smoothed strength per week, 0–100. */
    readonly strength: readonly (number | null)[];
    readonly xTicks: readonly { readonly x: number; readonly label: string }[];
}

export const seasonGeometry = (
    season: Season,
    { height, width }: { height: number; width: number }
): SeasonGeometry => {
    const plot = { left: 2, right: width - 2, top: 4, bottom: height - 18 };
    const count = Math.max(season.weeks.length, 1);
    const x = (week: number) => plot.left + ((week + 0.5) / count) * (plot.right - plot.left);
    const y = (value: number) => plot.bottom - (value / 100) * (plot.bottom - plot.top);
    const strength = seasonStrength(season.weeks);
    const points = strength.map((value, week) => ({
        x: x(week),
        y: value === null ? null : y(value),
    }));
    return {
        plot,
        line: segments(points)
            .map(run => run.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(''))
            .join(''),
        area: segments(points)
            .filter(run => run.length > 1)
            .map(run => {
                const top = run
                    .map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`)
                    .join('');
                return `${top}L${run.at(-1)?.x},${plot.bottom}L${run[0]?.x},${plot.bottom}Z`;
            })
            .join(''),
        points,
        strength,
        xTicks: monthTicks(season.weeks).map(tick => ({ x: x(tick.week), label: tick.label })),
    };
};

/** A week's sales per ranked design, or null when no design was ranked. */
export const perDesign = (week: SeasonWeek | undefined) =>
    week && week.sales !== null && week.designs > 0 ? week.sales / week.designs : null;

/** Each week's sales per design as 0–100 of the busiest, averaged with the weeks either side. */
export const seasonStrength = (weeks: readonly SeasonWeek[]) => {
    const raw = weeks.map(perDesign);
    const peak = Math.max(0, ...raw.map(value => value ?? 0));
    return raw.map((value, week) => {
        if (value === null || peak <= 0) {
            return null;
        }
        const window = [raw[week - 1], value, raw[week + 1]].filter(
            (neighbour): neighbour is number => neighbour !== null && neighbour !== undefined
        );
        return (window.reduce((sum, entry) => sum + entry, 0) / window.length / peak) * 100;
    });
};

/** The busiest week (sales per design), or null with no ranked week. */
export const seasonPeakWeek = (season: Season) => {
    let best: SeasonWeek | null = null;
    for (const week of season.weeks) {
        if ((perDesign(week) ?? 0) > (perDesign(best ?? undefined) ?? 0)) {
            best = week;
        }
    }
    return best;
};

/** The week index nearest a pointer x. */
export const seasonWeekAt = (pointerX: number, geometry: SeasonGeometry) => {
    const { left, right } = geometry.plot;
    const count = geometry.points.length;
    return Math.min(count - 1, Math.max(0, Math.floor(((pointerX - left) / (right - left)) * count)));
};

/** `Nov 19` (or `Nov 19, 2025`) for a week's first day. */
export const seasonWeekLabel = (start: string, withYear = false) =>
    new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: withYear ? 'numeric' : undefined,
    }).format(new Date(`${start}T00:00:00Z`));

/** The first week starting in each month, labelled with the month; January carries its year. */
const monthTicks = (weeks: readonly SeasonWeek[]) => {
    const ticks: { week: number; label: string }[] = [];
    weeks.forEach((week, index) => {
        const month = week.start.slice(0, 7);
        if (index > 0 && month !== weeks[index - 1]?.start.slice(0, 7)) {
            const date = new Date(`${week.start}T00:00:00Z`);
            ticks.push({
                week: index,
                label:
                    date.getUTCMonth() === 0
                        ? String(date.getUTCFullYear())
                        : monthFormat.format(date),
            });
        }
    });
    return ticks;
};

const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

/** Runs of known points; a gap starts a new run. */
const segments = (points: readonly { x: number; y: number | null }[]) => {
    const runs: { x: number; y: number }[][] = [[]];
    for (const point of points) {
        if (point.y === null) {
            runs.push([]);
        } else {
            runs.at(-1)?.push({ x: point.x, y: point.y });
        }
    }
    return runs.filter(run => run.length > 0);
};
