const DAY_MS = 24 * 60 * 60 * 1000;

const fmtMonthDay = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
});
const fmtMonth = new Intl.DateTimeFormat("en-US", { month: "short" });
const fmtMonthYear = new Intl.DateTimeFormat("en-US", {
	month: "short",
	year: "2-digit",
});

export const buildXAxisTicks = (startMs: number, endMs: number): number[] => {
	const rangeDays = (endMs - startMs) / DAY_MS;
	if (rangeDays <= 14) {
		return buildDayAlignedTicks(startMs, endMs, rangeDays <= 7 ? 1 : 2);
	}
	if (rangeDays <= 45) {
		return buildDayAlignedTicks(startMs, endMs, 7);
	}
	if (rangeDays <= 100) {
		return buildDayAlignedTicks(startMs, endMs, 14);
	}

	let monthStep = 1;
	if (rangeDays <= 400) {
		monthStep = 1;
	} else if (rangeDays <= 800) {
		monthStep = 2;
	} else {
		monthStep = 3;
	}

	return buildMonthAlignedTicks(startMs, endMs, monthStep);
};

export const buildXAxisFormatter = (startMs: number, endMs: number) => {
	const rangeDays = (endMs - startMs) / DAY_MS;
	if (rangeDays <= 100) {
		return (timestamp: number) => fmtMonthDay.format(new Date(timestamp));
	}
	if (rangeDays <= 400) {
		return (timestamp: number) => {
			const date = new Date(timestamp);
			return date.getMonth() === 0
				? fmtMonthYear.format(date)
				: fmtMonth.format(date);
		};
	}

	return (timestamp: number) => fmtMonthYear.format(new Date(timestamp));
};

const buildDayAlignedTicks = (
	startMs: number,
	endMs: number,
	stepDays: number
) => {
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
	monthStep: number
) => {
	const ticks: number[] = [];
	const start = new Date(startMs);
	let current = new Date(start.getFullYear(), start.getMonth() + 1, 1);

	while (current.getTime() <= endMs) {
		ticks.push(current.getTime());
		current = new Date(
			current.getFullYear(),
			current.getMonth() + monthStep,
			1
		);
	}

	return ticks;
};
