const DAY_IN_MS = 24 * 60 * 60 * 1000;

const fmtMonthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'short' });
const fmtMonthYear = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });

export type EvenYAxisScale = {
    domain: [number, number];
    ticks: number[];
};

export const buildEvenYAxisScale = (
    values: number[],
    options?: {
        tickCount?: number;
        min?: number;
    },
): EvenYAxisScale => {
    const tickCount = Math.max(2, options?.tickCount ?? 5);
    const minFloor = options?.min ?? 0;

    if (values.length === 0) {
        return {
            domain: [0, 1],
            ticks: [0, 1],
        };
    }

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rawRange = Math.max(1, rawMax - rawMin);
    const padding = Math.max(1, rawRange * 0.05);
    const paddedMin = Math.max(minFloor, rawMin - padding);
    const paddedMax = rawMax + padding;
    const roughStep = (paddedMax - paddedMin) / (tickCount - 1);
    const step = getNiceStep(roughStep);

    const domainMin = Math.floor(paddedMin / step) * step;
    const domainMaxCandidate = Math.ceil(paddedMax / step) * step;
    const domainMax = domainMaxCandidate <= domainMin ? domainMin + step : domainMaxCandidate;

    return {
        domain: [domainMin, domainMax],
        ticks: buildTickValues(domainMin, domainMax, step),
    };
};

export const buildXAxisTicks = (startMs: number, endMs: number): number[] => {
    const rangeDays = (endMs - startMs) / DAY_IN_MS;

    if (rangeDays <= 14) {
        return buildDayAlignedTicks(startMs, endMs, rangeDays <= 7 ? 1 : 2);
    }
    if (rangeDays <= 45) {
        return buildDayAlignedTicks(startMs, endMs, 7);
    }
    if (rangeDays <= 100) {
        return buildDayAlignedTicks(startMs, endMs, 14);
    }

    const monthStep = rangeDays <= 400 ? 1 : rangeDays <= 800 ? 2 : 3;
    return buildMonthAlignedTicks(startMs, endMs, monthStep);
};

export const buildXAxisFormatter = (startMs: number, endMs: number) => {
    const rangeDays = (endMs - startMs) / DAY_IN_MS;

    if (rangeDays <= 100) {
        return (timestamp: number) => fmtMonthDay.format(new Date(timestamp));
    }

    if (rangeDays <= 400) {
        return (timestamp: number) => {
            const date = new Date(timestamp);
            return date.getMonth() === 0 ? fmtMonthYear.format(date) : fmtMonth.format(date);
        };
    }

    return (timestamp: number) => fmtMonthYear.format(new Date(timestamp));
};

export const formatDateShort = (timestamp: number) => fmtMonthYear.format(new Date(timestamp));

const buildDayAlignedTicks = (startMs: number, endMs: number, stepDays: number): number[] => {
    const ticks: number[] = [];
    const start = new Date(startMs);
    start.setHours(0, 0, 0, 0);
    if (start.getTime() < startMs) {
        start.setDate(start.getDate() + 1);
    }

    const current = new Date(start);
    while (current.getTime() <= endMs) {
        ticks.push(current.getTime());
        current.setDate(current.getDate() + stepDays);
        current.setHours(0, 0, 0, 0);
    }

    return ticks;
};

const buildMonthAlignedTicks = (
    startMs: number,
    endMs: number,
    monthStep: number,
): number[] => {
    const ticks: number[] = [];
    const start = new Date(startMs);
    let current = new Date(start.getFullYear(), start.getMonth() + 1, 1);

    while (current.getTime() <= endMs) {
        ticks.push(current.getTime());
        current = new Date(current.getFullYear(), current.getMonth() + monthStep, 1);
    }

    return ticks;
};

const getNiceStep = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
        return 1;
    }

    const exponent = Math.floor(Math.log10(value));
    const fraction = value / 10 ** exponent;

    let niceFraction = 1;
    if (fraction <= 1) {
        niceFraction = 1;
    } else if (fraction <= 2) {
        niceFraction = 2;
    } else if (fraction <= 2.5) {
        niceFraction = 2.5;
    } else if (fraction <= 5) {
        niceFraction = 5;
    } else {
        niceFraction = 10;
    }

    return niceFraction * 10 ** exponent;
};

const buildTickValues = (domainMin: number, domainMax: number, step: number) => {
    const values: number[] = [];
    const maxTicks = 24;

    for (
        let current = domainMin;
        current <= domainMax + step / 2 && values.length < maxTicks;
        current += step
    ) {
        values.push(Number(current.toFixed(8)));
    }

    if (values.length === 0) {
        return [domainMin, domainMax];
    }

    const lastTick = values.at(-1);
    if (lastTick !== domainMax) {
        values.push(domainMax);
    }

    return values;
};
