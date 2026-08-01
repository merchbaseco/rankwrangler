import { AlertCircle, CheckCircle2, LoaderCircle, SearchX } from "lucide-react";

export type CatalogDisplayStatus =
	| { kind: "idle" }
	| { kind: "pending" }
	| { kind: "ready" }
	| { kind: "empty"; observedAt: string }
	| { kind: "error"; message: string };

export const CatalogStatusPanel = ({
	status,
	hasPriorEvidence = false,
}: {
	status: CatalogDisplayStatus;
	hasPriorEvidence?: boolean;
}) => {
	if (status.kind === "ready") {
		return null;
	}

	if (status.kind === "idle") {
		return (
			<div className="flex h-full min-h-64 items-center justify-center px-6">
				<div className="max-w-md text-center">
					<SearchX className="mx-auto mb-3 size-7 text-muted-foreground/70" />
					<h2 className="font-display text-lg font-semibold">
						Explore Amazon catalog results
					</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						Search a phrase to preserve Keepa source order and compare
						observations across runs.
					</p>
				</div>
			</div>
		);
	}

	if (status.kind === "pending") {
		return (
			<div className="border-b border-border bg-card px-5 py-4">
				<div className="flex items-center gap-2 text-sm font-medium">
					<LoaderCircle className="size-4 animate-spin" />
					Checking for current catalog data…
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					This can take a moment. You can reload safely while the search
					continues.
				</p>
				<div className="mt-4 grid grid-cols-3 gap-3" aria-hidden="true">
					{["one", "two", "three"].map((key) => (
						<div
							key={key}
							className="h-12 animate-pulse rounded-sm bg-muted"
						/>
					))}
				</div>
			</div>
		);
	}

	if (status.kind === "error") {
		return (
			<div className="border-b border-destructive/20 bg-destructive/5 px-5 py-4">
				<div className="flex items-center gap-2 text-sm font-medium text-destructive">
					<AlertCircle className="size-4" />
					{status.message}
				</div>
				{hasPriorEvidence ? (
					<p className="mt-1 text-xs text-muted-foreground">
						Your previous successful run remains below.
					</p>
				) : (
					<p className="mt-1 text-xs text-muted-foreground">
						Retry the search shortly.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="flex min-h-64 items-center justify-center px-6">
			<div className="max-w-md text-center">
				<CheckCircle2 className="mx-auto mb-3 size-7 text-success" />
				<h2 className="font-display text-lg font-semibold">
					No products surfaced
				</h2>
				<p className="mt-2 text-sm text-muted-foreground">
					The search completed successfully at{" "}
					{new Date(status.observedAt).toLocaleString()}, but Keepa returned
					no accepted Products. Earlier runs remain available in history.
				</p>
			</div>
		</div>
	);
};
