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

type CopyState = "idle" | "copying" | "copied" | "error";

const getCopyButtonTitle = (copyState: CopyState): string => {
	if (copyState === "copying") {
		return "Copying debug snapshot";
	}

	if (copyState === "copied") {
		return "Debug snapshot copied";
	}

	if (copyState === "error") {
		return "Copy failed";
	}

	return "Copy debug snapshot";
};

const getCopyButtonClasses = (copyState: CopyState): string => {
	if (copyState === "error") {
		return "bg-red-100 text-red-700 hover:bg-red-200";
	}

	if (copyState === "copied") {
		return "bg-green-100 text-green-700 hover:bg-green-200";
	}

	if (copyState === "copying") {
		return "bg-gray-900 text-gray-100";
	}

	return "bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900";
};

const getCopyButtonIcon = (copyState: CopyState) => {
	if (copyState === "copying") {
		return <LoaderCircle className="h-3.5 w-3.5 animate-spin" />;
	}

	if (copyState === "copied") {
		return <Check className="h-3.5 w-3.5" />;
	}

	if (copyState === "error") {
		return <AlertCircle className="h-3.5 w-3.5" />;
	}

	return <Copy className="h-3.5 w-3.5" />;
};

export const DebugWidget = () => {
	const { cacheSize } = useProductCache();
	const { queueCount } = useProductIngestQueueCount();
	const { data: reactRootsCount } = useReactRootsCount();
	const [isExpanded, setIsExpanded] = useState(true);
	const [copyState, setCopyState] = useState<CopyState>("idle");

	const handleCopyDebugInfo = async () => {
		if (copyState === "copying") {
			return;
		}

		setCopyState("copying");

		try {
			await copyDebugDumpToClipboard({
				debugMode: true,
				cacheSize: cacheSize ?? 0,
				queueCount: queueCount ?? 0,
				reactRootsCount: reactRootsCount ?? 0,
			});
			setCopyState("copied");

			setTimeout(() => {
				setCopyState("idle");
			}, 1200);
		} catch (error) {
			log.error("Failed to copy debug dump:", { error });
			setCopyState("error");

			setTimeout(() => {
				setCopyState("idle");
			}, 1600);
		}
	};

	const copyButtonTitle = getCopyButtonTitle(copyState);
	const copyButtonClasses = getCopyButtonClasses(copyState);
	const copyButtonIcon = getCopyButtonIcon(copyState);

	return (
		<div className="fixed right-4 bottom-4 z-[10000] w-[280px] font-sans">
			<div
				className="overflow-hidden rounded-lg border border-white/30 bg-white/80 shadow-lg backdrop-blur-md"
				style={{ backdropFilter: "blur(12px)" }}
			>
				{/* Header */}
				<div className="flex items-center justify-between gap-2 p-2">
					<span className="font-medium text-gray-800 text-xs">
						Rank Wrangler
					</span>
					<div className="flex items-center gap-1">
						<button
							aria-label={copyButtonTitle}
							className={`grid h-6 w-6 place-items-center rounded transition-colors ${copyButtonClasses}`}
							disabled={copyState === "copying"}
							onClick={handleCopyDebugInfo}
							title={copyButtonTitle}
							type="button"
						>
							{copyButtonIcon}
						</button>
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
					</div>
				) : null}
			</div>
		</div>
	);
};
