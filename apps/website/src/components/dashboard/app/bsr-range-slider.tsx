import { useCallback, useMemo } from "react";
import {
	BSR_MAX,
	BSR_MIN,
	bsrToSlider,
	formatBsr,
	sliderToBsr,
} from "@/components/dashboard/app/config";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const DEFAULT_SLIDER = [SLIDER_MIN, SLIDER_MAX] as [number, number];

const TICK_MARKS = [
	{ bsr: 1_000, label: "1K" },
	{ bsr: 10_000, label: "10K" },
	{ bsr: 100_000, label: "100K" },
	{ bsr: 1_000_000, label: "1M" },
];

export const BsrRangeSlider = ({
	bsrRange,
	onChange,
}: {
	bsrRange: [number, number] | null;
	onChange: (range: [number, number] | null) => void;
}) => {
	const sliderValue = useMemo<[number, number]>(() => {
		if (!bsrRange) return DEFAULT_SLIDER;
		return [bsrToSlider(bsrRange[0]), bsrToSlider(bsrRange[1])];
	}, [bsrRange]);

	const displayMin = bsrRange ? formatBsr(bsrRange[0]) : formatBsr(BSR_MIN);
	const displayMax = bsrRange ? formatBsr(bsrRange[1]) : formatBsr(BSR_MAX);
	const isFiltered = bsrRange !== null;

	const handleValueCommitted = useCallback(
		(value: number | readonly number[]) => {
			const values = Array.isArray(value) ? value : [value, value];
			const min = sliderToBsr(values[0]);
			const max = sliderToBsr(values[1]);
			if (min <= BSR_MIN && max >= BSR_MAX) {
				onChange(null);
			} else {
				onChange([min, max]);
			}
		},
		[onChange],
	);

	return (
		<div className="flex flex-col gap-2.5 px-2.5">
			<div className="flex items-center justify-between">
				<span className="font-mono text-xs tabular-nums text-foreground">
					{displayMin} — {displayMax}
				</span>
				{isFiltered ? (
					<Button
						className="h-auto rounded-sm px-0 py-0 text-[10px] text-muted-foreground hover:text-foreground"
						onClick={() => onChange(null)}
						size="sm"
						variant="ghost"
					>
						Reset
					</Button>
				) : null}
			</div>
			<Slider
				value={sliderValue}
				min={SLIDER_MIN}
				max={SLIDER_MAX}
				step={0.5}
				onValueCommitted={handleValueCommitted}
			/>
			<div className="relative h-3">
				{TICK_MARKS.map((tick) => {
					const position = bsrToSlider(tick.bsr);
					return (
						<span
							key={tick.label}
							className="absolute -translate-x-1/2 text-[9px] leading-none text-muted-foreground"
							style={{ left: `${position}%` }}
						>
							{tick.label}
						</span>
					);
				})}
			</div>
		</div>
	);
};
