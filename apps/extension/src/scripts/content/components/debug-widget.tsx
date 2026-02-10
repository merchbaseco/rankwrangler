import { Database, GitBranch, LoaderCircle } from "lucide-react";
import { useProductCache } from "../hooks/use-product-cache";
import { useProductIngestQueueCount } from "../hooks/use-product-ingest-queue-count";
import { useReactRootsCount } from "../hooks/use-react-root-count";

export const DebugWidget = () => {
	const { cacheSize } = useProductCache();
	const { queueCount } = useProductIngestQueueCount();
	const { data: reactRootsCount } = useReactRootsCount();

	return (
		<div className="fixed right-4 bottom-4 z-[10000] font-sans">
			<div
				className="overflow-hidden rounded-lg border border-white/30 bg-white/80 shadow-lg backdrop-blur-md"
				style={{ backdropFilter: "blur(12px)" }}
			>
				{/* Header */}
				<div className="flex items-center gap-2 p-2">
					<span className="font-medium text-gray-800 text-xs">
						Rank Wrangler
					</span>
				</div>

				{/* Stats content - always visible */}
				<div className="space-y-2 p-2">
					{/* Cache stat */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="flex h-4 w-4 items-center justify-center rounded bg-blue-500/20 backdrop-blur-sm">
								<Database className="h-3 w-3 text-blue-700" />
							</div>
							<span className="text-gray-700 text-xs">Cache</span>
						</div>
						<span className="font-bold text-gray-900 text-xs">
							{cacheSize ?? 0}
						</span>
					</div>

					{/* Queue stat */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="flex h-4 w-4 items-center justify-center rounded bg-orange-500/20 backdrop-blur-sm">
								<LoaderCircle className="h-3 w-3 animate-spin text-orange-700" />
							</div>
							<span className="text-gray-700 text-xs">Queue</span>
						</div>
						<span className="font-bold text-gray-900 text-xs">
							{queueCount ?? 0}
						</span>
					</div>

					{/* React Roots stat */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<div className="flex h-4 w-4 items-center justify-center rounded bg-purple-500/20 backdrop-blur-sm">
								<GitBranch className="h-3 w-3 text-purple-700" />
							</div>
							<span className="text-gray-700 text-xs">Roots</span>
						</div>
						<span className="font-bold text-gray-900 text-xs">
							{reactRootsCount ?? 0}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
};
