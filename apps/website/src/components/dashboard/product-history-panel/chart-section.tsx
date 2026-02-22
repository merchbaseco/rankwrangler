import { useCallback, useMemo, useRef, useState } from 'react';
import { buildChartGeometry, formatDateShort, formatValue, INNER_W, PAD, VB_W } from '@/components/dashboard/product-history-panel/chart-utils';
import {
	buildChartState,
	buildPoints,
	getHoverPosition,
} from '@/components/dashboard/product-history-panel/chart-data';
import {
	ChartSvg,
	ChartTooltip,
} from '@/components/dashboard/product-history-panel/chart-svg';
import {
	ChartSkeleton,
	SyncingChartPlaceholder,
} from '@/components/dashboard/product-history-panel/syncing-chart-placeholder';
import type {
	HistoryTimeDomain,
	HistoryQueryResult,
	SelectOption,
} from '@/components/dashboard/product-history-panel/types';
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

type ChartSectionProps = {
	label: string;
	selectValue: string;
	onSelectChange: (value: string) => void;
	selectOptions: SelectOption[];
	query: HistoryQueryResult;
	metric: string;
	isPrice: boolean;
	gradientId: string;
	isSyncing?: boolean;
	timeDomain?: HistoryTimeDomain | null;
};

export const ChartSection = ({
	label,
	selectValue,
	onSelectChange,
	selectOptions,
	query,
	metric,
	isPrice,
	gradientId,
	isSyncing,
	timeDomain,
}: ChartSectionProps) => {
	const [hoverIndex, setHoverIndex] = useState<number | null>(null);
	const chartRef = useRef<HTMLDivElement>(null);

	const points = useMemo(() => buildPoints(query), [query]);
	const { sampledPoints, chartGeometry } = useMemo(
		() => buildChartState(points, timeDomain),
		[points, timeDomain],
	);

	const latestPoint = points.at(-1) ?? null;
	const hoverPoint = hoverIndex !== null ? (sampledPoints[hoverIndex] ?? null) : null;
	const firstPoint = points[0] ?? null;
	const rangeStartTimestamp = timeDomain?.startAt ?? firstPoint?.timestamp ?? null;
	const rangeEndTimestamp = timeDomain?.endAt ?? latestPoint?.timestamp ?? null;
	const hoverPosition = useMemo(
		() => getHoverPosition({ chartGeometry, hoverPoint }),
		[chartGeometry, hoverPoint],
	);

	const selectedOptionLabel = useMemo(
		() =>
			selectOptions.find((option) => option.value === selectValue)?.label ??
			selectValue,
		[selectOptions, selectValue],
	);

	const isLoading = query.isLoading && !query.data;
	const hasData = points.length > 0 && chartGeometry;
	const color = isPrice ? 'var(--color-chart-4)' : 'var(--color-chart-1)';

	const handleMouseMove = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (!chartGeometry || sampledPoints.length === 0) {
				return;
			}

			const element = chartRef.current;
			if (!element) {
				return;
			}

			const rect = element.getBoundingClientRect();
			const svgX = ((event.clientX - rect.left) / rect.width) * VB_W;
			if (svgX < PAD.l || svgX > VB_W - PAD.r) {
				setHoverIndex(null);
				return;
			}

			const fraction = (svgX - PAD.l) / INNER_W;
			const targetTimestamp =
				chartGeometry.tMin + fraction * (chartGeometry.tMax - chartGeometry.tMin);
			setHoverIndex(findNearestPoint(sampledPoints, targetTimestamp));
		},
		[chartGeometry, sampledPoints],
	);

	return (
		<div className="rounded-xl border border-border bg-white">
			<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
				<span className="text-xs font-semibold text-secondary-foreground">{label}</span>
				{selectOptions.length > 0 ? (
					<Select
						value={selectValue}
						onValueChange={(value) => {
							if (value) {
								onSelectChange(value);
							}
						}}
					>
						<SelectTrigger size="sm" className="w-auto">
							<SelectValue>{selectedOptionLabel}</SelectValue>
						</SelectTrigger>
						<SelectPopup>
							{selectOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectPopup>
					</Select>
				) : null}
			</div>
			<div className="p-4">
				{isLoading ? <ChartSkeleton /> : null}
				{query.isError ? (
					<div className="rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs text-red-700">
						{query.error?.message}
					</div>
				) : null}
				{!isLoading && !query.isError && points.length === 0 ? (
					isSyncing ? (
						<SyncingChartPlaceholder color={color} gradientId={gradientId} />
					) : (
						<div className="bg-muted/30 flex items-center justify-center rounded-lg border border-dashed border-border py-8">
							<p className="text-sm text-muted-foreground">No data for this range yet.</p>
						</div>
					)
				) : null}
				{hasData ? (
					<>
						<div className="mb-3">
							<p className="stat-value text-2xl font-bold tracking-tight text-foreground">
								{latestPoint ? formatValue(metric, latestPoint.value) : '-'}
							</p>
							{rangeStartTimestamp !== null && rangeEndTimestamp !== null ? (
								<p className="mt-0.5 text-sm text-muted-foreground">
									{formatDateShort(rangeStartTimestamp)} &ndash;{' '}
									{formatDateShort(rangeEndTimestamp)}
								</p>
							) : null}
						</div>
						<div
							ref={chartRef}
							className="relative cursor-crosshair rounded-lg border border-border"
							onMouseMove={handleMouseMove}
							onMouseLeave={() => setHoverIndex(null)}
						>
							<ChartSvg
								chartGeometry={chartGeometry as NonNullable<ReturnType<typeof buildChartGeometry>>}
								color={color}
								hoverPosition={{ x: hoverPosition.x, y: hoverPosition.y }}
								gradientId={gradientId}
								metric={metric}
							/>
							{hoverPoint ? (
								<ChartTooltip
									flip={hoverPosition.flip}
									hoverPoint={hoverPoint}
									hoverXPercent={hoverPosition.leftPercent}
									hoverYPercent={hoverPosition.topPercent}
									metric={metric}
								/>
							) : null}
						</div>
					</>
				) : null}
			</div>
		</div>
	);
};

const findNearestPoint = (
	sampledPoints: { timestamp: number }[],
	targetTimestamp: number,
) => {
	let nearestIndex = 0;
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (let index = 0; index < sampledPoints.length; index += 1) {
		const point = sampledPoints[index];
		const distance = Math.abs(point.timestamp - targetTimestamp);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestIndex = index;
		}
	}

	return nearestIndex;
};
