import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/trpc";

const MARKETPLACES = [
	{ id: "ATVPDKIKX0DER", label: "US", flag: "🇺🇸" },
	{ id: "A1F83G8C2ARO7P", label: "UK", flag: "🇬🇧" },
	{ id: "A1PA6795UKMFR9", label: "DE", flag: "🇩🇪" },
	{ id: "A13V1IB3VIYZZH", label: "FR", flag: "🇫🇷" },
	{ id: "A1VC38T7YXB528", label: "JP", flag: "🇯🇵" },
] as const;

export function SearchBar() {
	const [query, setQuery] = useState("");
	const [marketplaceId, setMarketplaceId] = useState(MARKETPLACES[0].id);
	const [configOpen, setConfigOpen] = useState(false);
	const configRef = useRef<HTMLDivElement>(null);
	const mutation = api.api.app.getProductInfo.useMutation();
	const historyMutation = api.api.app.loadProductHistory.useMutation();

	const selectedMarketplace =
		MARKETPLACES.find((m) => m.id === marketplaceId) ?? MARKETPLACES[0];

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const cleaned = query.trim().toUpperCase();
		if (!cleaned || mutation.isPending) return;
		historyMutation.reset();
		mutation.mutate({ asin: cleaned, marketplaceId });
	};

	const handleLoadHistory = () => {
		if (!mutation.data || historyMutation.isPending) {
			return;
		}

		historyMutation.mutate({
			marketplaceId: mutation.data.marketplaceId,
			asin: mutation.data.asin,
			days: 365,
		});
	};

	useEffect(() => {
		if (!configOpen) return;
		const handleClick = (e: MouseEvent) => {
			if (configRef.current && !configRef.current.contains(e.target as Node)) {
				setConfigOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [configOpen]);

	return (
		<div className="space-y-4">
			{/* Search bar */}
			<form onSubmit={handleSubmit}>
				<div className="flex items-center gap-3 rounded-xl border border-input bg-popover px-5 py-3.5 shadow-xs">
					{mutation.isPending ? (
						<Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
					) : (
						<Search className="size-5 shrink-0 text-muted-foreground" />
					)}
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search by ASIN..."
						className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
						disabled={mutation.isPending}
					/>

					{/* Config toggle */}
					<div ref={configRef} className="relative shrink-0">
						<button
							type="button"
							onClick={() => setConfigOpen((prev) => !prev)}
							className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent"
						>
							<span className="text-xs">{selectedMarketplace.flag}</span>
							<SlidersHorizontal className="size-4 text-muted-foreground" />
						</button>

						{configOpen && (
							<div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-input bg-popover p-2 shadow-lg">
								<p className="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
									Marketplace
								</p>
								{MARKETPLACES.map((m) => (
									<button
										key={m.id}
										type="button"
										onClick={() => {
											setMarketplaceId(m.id);
											setConfigOpen(false);
										}}
										className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
											marketplaceId === m.id
												? "bg-primary text-primary-foreground"
												: "text-foreground hover:bg-accent"
										}`}
									>
										<span>{m.flag}</span>
										<span className="font-medium">{m.label}</span>
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</form>

			{mutation.isSuccess && mutation.data && (
				<div className="animate-fade-up rounded-xl border border-input bg-popover p-5 shadow-xs">
					<div className="flex gap-4">
						{mutation.data.thumbnailUrl && (
							<img
								src={mutation.data.thumbnailUrl}
								alt={mutation.data.title ?? mutation.data.asin}
								className="size-16 shrink-0 rounded-lg bg-secondary object-contain p-1"
							/>
						)}
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-semibold text-foreground">
								{mutation.data.title ?? "Untitled"}
							</p>
							<p className="mt-1 font-mono text-xs text-muted-foreground">
								{mutation.data.asin}
								{mutation.data.rootCategoryDisplayName &&
									` \u00B7 ${mutation.data.rootCategoryDisplayName}`}
							</p>
							{mutation.data.rootCategoryBsr && (
								<p className="mt-1.5 text-lg font-bold text-foreground">
									#{mutation.data.rootCategoryBsr.toLocaleString()}
								</p>
							)}
							<div className="mt-3 flex items-center gap-3">
								<button
									type="button"
									onClick={handleLoadHistory}
									disabled={historyMutation.isPending}
									className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
								>
									{historyMutation.isPending
										? "Loading Keepa history..."
										: "History"}
								</button>
								{historyMutation.isSuccess && (
									<p className="text-xs text-secondary-foreground">
										Stored {historyMutation.data.pointsStored.toLocaleString()}{" "}
										points.
									</p>
								)}
							</div>
							{historyMutation.isError && (
								<p className="mt-2 text-xs font-medium text-red-700">
									{historyMutation.error.message}
								</p>
							)}
						</div>
					</div>
				</div>
			)}

			{mutation.isError && (
				<p className="text-sm font-medium text-red-700">
					{mutation.error.message}
				</p>
			)}
		</div>
	);
}
