import { Loader2, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectItem,
	SelectPopup,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	const mutation = api.api.app.getProductInfo.useMutation();
	const historyMutation = api.api.app.loadProductHistory.useMutation();

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		const cleaned = query.trim().toUpperCase();
		if (!cleaned || mutation.isPending) {
			return;
		}
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

	return (
		<div className="shrink-0 border-b border-border bg-card">
			<form className="flex items-center" onSubmit={handleSubmit}>
				<div className="relative flex-1">
					{mutation.isPending ? (
						<Loader2 className="text-muted-foreground absolute left-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin" />
					) : (
						<Search className="text-muted-foreground absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
					)}
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Lookup ASIN"
						className="h-9 rounded-none border-0 bg-transparent pl-9 text-xs font-mono shadow-none focus-within:ring-0"
						disabled={mutation.isPending}
					/>
				</div>
				<div className="flex items-center gap-1 pr-2">
				<Select value={marketplaceId} onValueChange={setMarketplaceId}>
					<SelectTrigger className="h-7 w-[80px] text-xs" size="sm">
						<SelectValue />
					</SelectTrigger>
					<SelectPopup>
						{MARKETPLACES.map((marketplace) => (
							<SelectItem key={marketplace.id} value={marketplace.id}>
								<span className="flex items-center gap-1">
									<span>{marketplace.flag}</span>
									<span>{marketplace.label}</span>
								</span>
							</SelectItem>
						))}
					</SelectPopup>
				</Select>
				<Button
					type="submit"
					size="sm"
					className="h-7 rounded-sm px-2 text-xs"
					disabled={mutation.isPending || query.trim().length === 0}
				>
					{mutation.isPending ? <Loader2 className="size-3 animate-spin" /> : "Lookup"}
				</Button>
				</div>
			</form>

			{mutation.isSuccess && mutation.data ? (
				<div className="animate-fade-up border-b border-border bg-background px-3 py-3">
					<div className="flex items-start gap-3">
						<div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted">
							{mutation.data.thumbnailUrl ? (
								<img
									src={mutation.data.thumbnailUrl}
									alt={mutation.data.title ?? mutation.data.asin}
									className="h-full w-full object-contain"
								/>
							) : (
								<span className="text-muted-foreground text-xs">N/A</span>
							)}
						</div>

						<div className="min-w-0 flex-1">
							<p className="line-clamp-1 text-xs font-medium text-foreground">
								{mutation.data.title ?? "Untitled"}
							</p>
							<div className="mt-1 flex flex-wrap items-center gap-1.5">
								<code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
									{mutation.data.asin}
								</code>
								<Badge variant="outline" className="h-4 rounded-sm px-1 text-xs">
									{mutation.data.marketplaceId === "ATVPDKIKX0DER"
										? "US"
										: MARKETPLACES.find((marketplace) => marketplace.id === mutation.data?.marketplaceId)?.label ?? mutation.data.marketplaceId}
								</Badge>
								{mutation.data.rootCategoryDisplayName ? (
									<span className="text-muted-foreground text-xs">
										{mutation.data.rootCategoryDisplayName}
									</span>
								) : null}
								{mutation.data.rootCategoryBsr ? (
									<Badge variant="secondary" className="h-4 rounded-sm px-1 font-mono text-xs">
										#{mutation.data.rootCategoryBsr.toLocaleString()}
									</Badge>
								) : null}
							</div>

							<div className="mt-2 flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									className="h-6 rounded-sm px-2 text-xs"
									onClick={handleLoadHistory}
									disabled={historyMutation.isPending}
								>
									{historyMutation.isPending ? (
										<Loader2 className="size-3 animate-spin" />
									) : (
										"Fetch History (365d)"
									)}
								</Button>
								{historyMutation.isSuccess ? (
									<span className="text-success-foreground text-xs">
										Stored {historyMutation.data.pointsStored.toLocaleString()} points.
									</span>
								) : null}
								{historyMutation.isError ? (
									<span className="text-destructive text-xs">
										{historyMutation.error.message}
									</span>
								) : null}
							</div>
						</div>
					</div>
				</div>
			) : null}

			{mutation.isError ? (
				<p className="text-destructive border-b border-border px-3 py-2 text-xs font-medium">
					{mutation.error.message}
				</p>
			) : null}
		</div>
	);
}
