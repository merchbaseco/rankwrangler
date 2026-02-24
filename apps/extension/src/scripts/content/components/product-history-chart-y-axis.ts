const Y_TICK_COUNT = 5;

export interface EvenYAxisScale {
	domain: [number, number];
	ticks: number[];
}

export const buildEvenYAxisScale = (
	values: number[],
	options?: {
		tickCount?: number;
		min?: number;
	}
): EvenYAxisScale => {
	const tickCount = Math.max(2, options?.tickCount ?? Y_TICK_COUNT);
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
	const domainMax =
		domainMaxCandidate <= domainMin ? domainMin + step : domainMaxCandidate;

	return {
		domain: [domainMin, domainMax],
		ticks: buildTickValues(domainMin, domainMax, step),
	};
};

export const formatAxisValue = (value: number) => {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(0)}k`;
	}

	return String(Math.round(value));
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

const buildTickValues = (
	domainMin: number,
	domainMax: number,
	step: number
) => {
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
