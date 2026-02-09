import {
	Database01Icon,
	HierarchySquare03Icon,
	Loading03Icon,
} from "hugeicons-react";
import { useProductCache } from "../hooks/use-product-cache";
import { useProductIngestQueueCount } from "../hooks/use-product-ingest-queue-count";
import { useReactRootsCount } from "../hooks/use-react-root-count";

export const DebugWidget = () => {
	const { cacheSize } = useProductCache();
	const { queueCount } = useProductIngestQueueCount();
	const { data: reactRootsCount } = useReactRootsCount();

	return (
		<div className="fixed bottom-4 right-4 z-[10000] font-sans">
			<div
				className="bg-white/80 backdrop-blur-md border border-white/30 rounded-lg shadow-lg overflow-hidden"
				style={{ backdropFilter: "blur(12px)" }}
			>
				{/* Header */}
				<div className="flex items-center gap-2 p-2">
					<span className="text-xs font-medium text-gray-800">
						Rank Wrangler
					</span>
				</div>

				{/* Stats content - always visible */}
				<div className="p-2 space-y-2">
					{/* Cache stat */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-4 h-4 bg-blue-500/20 backdrop-blur-sm rounded flex items-center justify-center">
								<Database01Icon className="w-3 h-3 text-blue-700" />
							</div>
							<span className="text-xs text-gray-700">Cache</span>
						</div>
						<span className="text-xs font-bold text-gray-900">
							{cacheSize ?? 0}
						</span>
					</div>

					{/* Queue stat */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-4 h-4 bg-orange-500/20 backdrop-blur-sm rounded flex items-center justify-center">
								<Loading03Icon className="w-3 h-3 text-orange-700" />
							</div>
							<span className="text-xs text-gray-700">Queue</span>
						</div>
						<span className="text-xs font-bold text-gray-900">
							{queueCount ?? 0}
						</span>
					</div>

					{/* React Roots stat */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="w-4 h-4 bg-purple-500/20 backdrop-blur-sm rounded flex items-center justify-center">
								<HierarchySquare03Icon className="w-3 h-3 text-purple-700" />
							</div>
							<span className="text-xs text-gray-700">Roots</span>
						</div>
						<span className="text-xs font-bold text-gray-900">
							{reactRootsCount ?? 0}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
};
