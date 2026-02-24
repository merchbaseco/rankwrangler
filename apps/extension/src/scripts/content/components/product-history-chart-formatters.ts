const fmtHoverDate = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

export const formatChartValue = (value: number) => `#${value.toLocaleString()}`;

export const formatHoverDate = (timestamp: number) =>
	fmtHoverDate.format(new Date(timestamp));
