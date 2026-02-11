import {
	AlertCircle,
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	Database,
	GitBranch,
	LoaderCircle,
} from "lucide-react";
import { useState } from "react";
import { log } from "../../../utils/logger";
import { copyDebugDumpToClipboard } from "../debug/debug-snapshot";
import { useProductCache } from "../hooks/use-product-cache";
import { useProductIngestQueueCount } from "../hooks/use-product-ingest-queue-count";
import { useReactRootsCount } from "../hooks/use-react-root-count";

export const DebugWidget = () => {
	const { cacheSize } = useProductCache();
	const { queueCount } = useProductIngestQueueCount();
	const { data: reactRootsCount } = useReactRootsCount();
	const [isExpanded, setIsExpanded] = useState(true);
	const [copyState, setCopyState] = useState<
		"idle" | "copying" | "copied" | "error"
	>("idle");
	const [copyMessage, setCopyMessage] = useState<string | null>(null);

	const handleCopyDebugInfo = async () => {
		if (copyState === "copying") {
			return;
		}

		setCopyState("copying");
		setCopyMessage(null);

		try {
			const result = await copyDebugDumpToClipboard({
				debugMode: true,
				cacheSize: cacheSize ?? 0,
				queueCount: queueCount ?? 0,
				reactRootsCount: reactRootsCount ?? 0,
			});
			setCopyState("copied");
			setCopyMessage(
				`Copied ${result.characterCount.toLocaleString("en-US")} characters`
			);

			setTimeout(() => {
				setCopyState("idle");
				setCopyMessage(null);
			}, 2500);
		} catch (error) {
			log.error("Failed to copy debug dump:", { error });
			setCopyState("error");
			setCopyMessage(
				error instanceof Error ? error.message : "Failed to copy debug dump"
			);
		}
	};

	let copyButtonText = "Copy debug info";
	if (copyState === "copying") {
		copyButtonText = "Copying...";
	} else if (copyState === "copied") {
		copyButtonText = "Copied";
	}

	return (
		<div className="fixed right-4 bottom-4 z-[10000] font-sans">
			<div
				className="overflow-hidden rounded-lg border border-white/30 bg-white/80 shadow-lg backdrop-blur-md"
				style={{ backdropFilter: "blur(12px)" }}
			>
				{/* Header */}
				<div className="flex items-center justify-between gap-2 p-2">
					<span className="font-medium text-gray-800 text-xs">
						Rank Wrangler
					</span>
					<button
						className="rounded p-1 text-gray-700 transition-colors hover:bg-white/80 hover:text-gray-900"
						onClick={() => setIsExpanded((current) => !current)}
						title={
							isExpanded ? "Collapse debug popover" : "Expand debug popover"
						}
						type="button"
					>
						{isExpanded ? (
							<ChevronDown className="h-3.5 w-3.5" />
						) : (
							<ChevronUp className="h-3.5 w-3.5" />
						)}
					</button>
				</div>

				{isExpanded ? (
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

						<button
							className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-gray-300/80 bg-white/90 px-2 py-1.5 font-medium text-gray-800 text-xs transition-colors hover:bg-white"
							onClick={handleCopyDebugInfo}
							type="button"
						>
							{copyState === "copied" ? (
								<Check className="h-3.5 w-3.5 text-green-700" />
							) : (
								<Copy className="h-3.5 w-3.5" />
							)}
							<span>{copyButtonText}</span>
						</button>

						{copyMessage ? (
							<div
								className={`flex items-start gap-1 rounded-md border px-1.5 py-1 text-[10px] ${
									copyState === "error"
										? "border-red-200 bg-red-50 text-red-700"
										: "border-green-200 bg-green-50 text-green-700"
								}`}
							>
								{copyState === "error" ? (
									<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
								) : (
									<Check className="mt-0.5 h-3 w-3 shrink-0" />
								)}
								<span>{copyMessage}</span>
							</div>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
};
