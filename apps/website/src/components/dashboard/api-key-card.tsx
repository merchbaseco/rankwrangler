import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";
import { useLicense } from "@/hooks/use-license";

const maskKey = (value: string) => {
	if (value.length <= 10) {
		return "•".repeat(value.length);
	}
	return `${value.slice(0, 7)}${"•".repeat(10)}${value.slice(-4)}`;
};

export function ApiKeyCard() {
	const [revealed, setRevealed] = useState(false);
	const { copy, copied } = useCopy();
	const {
		license,
		hasEmail,
		isLoading,
		errorCode,
		error,
		regenerate,
		isRegenerating,
	} = useLicense();

	const keyValue = useMemo(() => {
		if (!license?.key) {
			return "";
		}
		return revealed ? license.key : maskKey(license.key);
	}, [license?.key, revealed]);

	const showAccessError = errorCode === "FORBIDDEN";
	const showAuthError = errorCode === "UNAUTHORIZED";
	const showNotFound = errorCode === "NOT_FOUND";
	const showMissingKey =
		hasEmail && !license && !isLoading && !showAccessError && !showAuthError;
	const showError = error && !showAccessError && !showAuthError && !showNotFound;

	return (
		<div className="rounded-sm border border-border bg-card p-3">
			<div className="flex items-center gap-2">
				<p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
					API Key
				</p>
				{license ? <span className="size-1.5 rounded-full bg-success" /> : null}
			</div>

			{isLoading ? <p className="text-muted-foreground mt-2 text-xs">Loading...</p> : null}
			{showAccessError ? (
				<p className="text-warning-foreground mt-2 text-xs">
					Admin access required. Update ADMIN_EMAIL.
				</p>
			) : null}
			{showAuthError ? (
				<p className="text-warning-foreground mt-2 text-xs">
					Session expired. Please sign out and back in.
				</p>
			) : null}
			{showMissingKey ? (
				<p className="text-muted-foreground mt-2 text-xs">
					No API key yet. Generate one below.
				</p>
			) : null}

			{license ? (
				<div className="mt-2 flex items-center gap-2 rounded-sm border border-border bg-background px-2 py-1.5">
					<code className="text-foreground min-w-0 flex-1 truncate text-xs font-mono">
						{keyValue}
					</code>
					<button
						type="button"
						onClick={() => setRevealed((current) => !current)}
						className="text-muted-foreground hover:text-foreground transition-colors"
						aria-label={revealed ? "Hide API key" : "Show API key"}
					>
						{revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
					</button>
					<button
						type="button"
						onClick={() => license?.key && copy(license.key)}
						className="text-muted-foreground hover:text-foreground transition-colors"
						aria-label="Copy API key"
					>
						{copied ? (
							<Check className="text-success size-3.5" />
						) : (
							<Copy className="size-3.5" />
						)}
					</button>
				</div>
			) : null}

			{showError ? <p className="text-destructive mt-2 text-xs">{error.message}</p> : null}

			<Button
				type="button"
				variant="outline"
				size="sm"
				className="mt-2 h-7 w-full rounded-sm text-xs"
				onClick={() => regenerate()}
				disabled={isRegenerating || showAccessError || !hasEmail}
			>
				<RefreshCw className={isRegenerating ? "size-3 animate-spin" : "size-3"} />
				{license ? "Rotate Key" : "Generate Key"}
			</Button>
		</div>
	);
}
