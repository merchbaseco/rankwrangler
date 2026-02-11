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
		return "bg-emerald-100 text-emerald-700 hover:bg-emerald-200";
	}

	if (copyState === "copying") {
		return "bg-slate-900 text-slate-100";
	}

	return "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900";
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
		<div className="fixed right-4 bottom-4 z-[10000] w-[280px] font-mono">
			<div
				className="relative overflow-hidden rounded-2xl border border-slate-300/70 bg-gradient-to-br from-slate-50/95 via-white/95 to-orange-50/90 shadow-[0_16px_40px_rgba(15,23,42,0.2)] backdrop-blur-xl"
				style={{ backdropFilter: "blur(18px)" }}
			>
				<div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-orange-400/70 via-cyan-500/60 to-slate-900/60" />

				{/* Header */}
				<div className="relative flex h-11 items-center justify-between gap-2 px-3">
					<span className="font-semibold text-[11px] text-slate-800 uppercase tracking-[0.18em]">
						RankWrangler Debug
					</span>
					<div className="flex items-center gap-1">
						<button
							aria-label={copyButtonTitle}
							className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${copyButtonClasses}`}
							disabled={copyState === "copying"}
							onClick={handleCopyDebugInfo}
							title={copyButtonTitle}
							type="button"
						>
							{copyButtonIcon}
						</button>
						<button
							className="rounded-md p-1 text-slate-600 transition-colors hover:bg-white/90 hover:text-slate-900"
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
					<div className="border-slate-200/80 border-t px-3 pt-2 pb-3">
						{/* Cache stat */}
						<div className="space-y-2">
							<div className="flex h-8 items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-2.5">
								<div className="flex items-center gap-2">
									<div className="flex h-5 w-5 items-center justify-center rounded-md bg-cyan-500/15">
										<Database className="h-3.5 w-3.5 text-cyan-700" />
									</div>
									<span className="text-[11px] text-slate-700 uppercase tracking-[0.12em]">
										Cache
									</span>
								</div>
								<span className="font-semibold text-[12px] text-slate-900 tabular-nums">
									{cacheSize ?? 0}
								</span>
							</div>

							{/* Queue stat */}
							<div className="flex h-8 items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-2.5">
								<div className="flex items-center gap-2">
									<div className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500/15">
										<LoaderCircle className="h-3.5 w-3.5 animate-spin text-orange-700" />
									</div>
									<span className="text-[11px] text-slate-700 uppercase tracking-[0.12em]">
										Queue
									</span>
								</div>
								<span className="font-semibold text-[12px] text-slate-900 tabular-nums">
									{queueCount ?? 0}
								</span>
							</div>

							{/* React Roots stat */}
							<div className="flex h-8 items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-2.5">
								<div className="flex items-center gap-2">
									<div className="flex h-5 w-5 items-center justify-center rounded-md bg-fuchsia-500/15">
										<GitBranch className="h-3.5 w-3.5 text-fuchsia-700" />
									</div>
									<span className="text-[11px] text-slate-700 uppercase tracking-[0.12em]">
										Roots
									</span>
								</div>
								<span className="font-semibold text-[12px] text-slate-900 tabular-nums">
									{reactRootsCount ?? 0}
								</span>
							</div>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
};
