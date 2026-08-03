import {
	AlertCircle,
	ArrowUpRight,
	CheckCircle2,
	LoaderCircle,
	RefreshCw,
	Search,
	TimerReset,
} from "lucide-react";
import { useState } from "react";
import type { RouterOutputs } from "@/lib/trpc";
import { api } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

export type KeywordAutomationData =
	RouterOutputs["api"]["app"]["catalog"]["query"]["list"];
export type KeywordAutomationItem = KeywordAutomationData["items"][number];

const STATUS_LABELS: Record<KeywordAutomationItem["status"], string> = {
	inactive: "Inactive",
	pending: "Refreshing",
	failed: "Refresh failed",
	due: "Due",
	deferred: "Waiting to retry",
	expiringSoon: "Expiring soon",
	waiting: "Waiting",
};

const STATUS_VARIANTS: Record<
	KeywordAutomationItem["status"],
	"default" | "secondary" | "outline" | "error" | "info" | "success" | "warning"
> = {
	inactive: "outline",
	pending: "info",
	failed: "error",
	due: "warning",
	deferred: "warning",
	expiringSoon: "warning",
	waiting: "secondary",
};

export const KeywordAutomationPanel = ({
	onOpenResearch,
}: {
	onOpenResearch: (keyword: string) => void;
}) => {
	const [search, setSearch] = useState("");
	const query = api.api.app.catalog.query.list.useQuery(
		{
			limit: 100,
			...(search.trim() ? { search: search.trim() } : {}),
		},
		{
			refetchInterval: 15_000,
			refetchOnWindowFocus: false,
			retry: false,
		},
	);

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<AutomationPolicy />
			{query.isLoading ? (
				<div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
					<LoaderCircle className="size-4 animate-spin" />
					Loading keyword refresh status…
				</div>
			) : query.error ? (
				<div className="flex items-center gap-2 px-3 py-6 text-sm text-destructive">
					<AlertCircle className="size-4" />
					Keyword refresh status could not be loaded.
				</div>
			) : (
				<>
					<KeywordAutomationSummary summary={query.data?.summary} />
					<div className="flex items-center gap-2 border-y border-border bg-card px-3 py-2">
						<div className="relative min-w-0 flex-1">
							<Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								aria-label="Search keyword refreshes"
								className="h-8 pl-7"
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search keywords"
								value={search}
							/>
						</div>
						<Button
							aria-label="Refresh keyword status"
							className="h-8 px-2"
							disabled={query.isFetching}
							onClick={() => void query.refetch()}
							variant="outline"
						>
							<RefreshCw className={query.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />
							<span className="sr-only">Refresh keyword status</span>
						</Button>
					</div>
					<KeywordAutomationTable
						items={query.data?.items ?? []}
						onOpenResearch={onOpenResearch}
					/>
				</>
			)}
		</div>
	);
};

const AutomationPolicy = () => (
	<div className="border-b border-border bg-accent px-3 py-3">
		<div className="flex items-center gap-2">
			<TimerReset className="size-4 text-muted-foreground" />
			<p className="text-xs font-semibold text-foreground">Keyword refresh policy</p>
		</div>
		<p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
			A Product search keeps keyword interest active for 30 days, including when it
			reuses cached results. Active keywords are refreshed automatically about once a
			week. Interest expires without backfill, and each run records whether it was a
			Requested search or an Automatic refresh.
		</p>
	</div>
);

export const KeywordAutomationSummary = ({
	summary,
}: {
	summary: KeywordAutomationData["summary"] | undefined;
}) => {
	const metrics = [
		["Active", summary?.active],
		["Due", summary?.due],
		["Refreshed recently", summary?.refreshedRecently],
		["Waiting / deferred", summary?.waitingOrDeferred],
		["Failed", summary?.failed],
		["Expiring soon", summary?.expiringSoon],
	] as const;

	return (
		<div className="grid grid-cols-3 border-b border-border">
			{metrics.map(([label, value]) => (
				<div className="border-r border-border px-3 py-2 last:border-r-0" key={label}>
					<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						{label}
					</p>
					<p className="mt-0.5 font-mono text-lg font-semibold text-foreground">
						{value === undefined ? "—" : formatNumber(value)}
					</p>
				</div>
			))}
		</div>
	);
};

export const KeywordAutomationTable = ({
	items,
	onOpenResearch,
}: {
	items: KeywordAutomationItem[];
	onOpenResearch: (keyword: string) => void;
}) => (
	<div className="min-w-0 overflow-auto">
		<table className="w-full min-w-[980px] text-xs">
			<TableHeader className="sticky top-0 z-10 bg-card">
				<TableRow className="hover:bg-transparent">
					<TableHead>Keyword</TableHead>
					<TableHead>Last requested</TableHead>
					<TableHead>Last refreshed</TableHead>
					<TableHead>Next refresh</TableHead>
					<TableHead>Active until</TableHead>
					<TableHead>Status</TableHead>
					<TableHead className="text-right">Observations</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map((item) => (
					<TableRow key={item.id}>
						<TableCell className="max-w-56 whitespace-normal">
							<button
								className="group flex items-center gap-1 text-left font-medium text-foreground hover:underline"
								onClick={() => onOpenResearch(item.displayTerm)}
								type="button"
							>
								<span className="line-clamp-2">{item.displayTerm}</span>
								<ArrowUpRight className="size-3 shrink-0 opacity-60 group-hover:opacity-100" />
							</button>
						</TableCell>
						<TableCell>{formatTimestamp(item.lastRequestedAt)}</TableCell>
						<TableCell>{formatTimestamp(item.latestSuccessfulRunAt)}</TableCell>
						<TableCell>{formatTimestamp(item.nextRefreshAt)}</TableCell>
						<TableCell>{formatTimestamp(item.activeUntil)}</TableCell>
						<TableCell>
							<Badge
								aria-label={`Status: ${STATUS_LABELS[item.status]}`}
								className="rounded-sm"
								variant={STATUS_VARIANTS[item.status]}
							>
								{STATUS_LABELS[item.status]}
							</Badge>
						</TableCell>
						<TableCell className="text-right font-mono">
							{formatNumber(item.observationCount)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</table>
		{items.length === 0 ? (
			<div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
				<CheckCircle2 className="size-4" />
				No keyword observations match this search.
			</div>
		) : null}
	</div>
);

const formatTimestamp = (value: string | null) => {
	if (!value) {
		return "—";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "—";
	}
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
};
