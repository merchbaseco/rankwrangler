export const renderChartStateFallback = ({
	collecting,
	displayPointCount,
	error,
	isLoading,
	pointCount,
	topMarginClass,
}: {
	collecting: boolean;
	displayPointCount: number;
	error: string | null;
	isLoading: boolean;
	pointCount: number;
	topMarginClass: string;
}) => {
	if (isLoading) {
		return (
			<div
				className={`${topMarginClass}h-20 animate-pulse rounded-md border border-gray-200 bg-gray-100`}
			/>
		);
	}

	if (error) {
		return (
			<div
				className={`${topMarginClass}rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-red-700 text-xs`}
			>
				{error}
			</div>
		);
	}

	if (collecting) {
		return (
			<div
				className={`${topMarginClass}rounded-md border border-gray-200 bg-white px-3 py-2.5`}
			>
				<div className="flex items-center gap-2">
					<svg
						className="h-3.5 w-3.5 animate-spin text-gray-400"
						fill="none"
						viewBox="0 0 24 24"
					>
						<title>Loading</title>
						<circle
							className="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							strokeWidth="4"
						/>
						<path
							className="opacity-75"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							fill="currentColor"
						/>
					</svg>
					<span className="text-gray-500 text-xs">Loading BSR history…</span>
				</div>
			</div>
		);
	}

	if (pointCount === 0) {
		return (
			<div
				className={`${topMarginClass}rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5`}
			>
				<span className="font-medium text-gray-700 text-xs">
					No BSR history available.
				</span>
			</div>
		);
	}

	if (displayPointCount === 0) {
		return (
			<div
				className={`${topMarginClass}rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5`}
			>
				<span className="font-medium text-gray-700 text-xs">
					No BSR history in this range.
				</span>
			</div>
		);
	}

	return null;
};
