import { ExternalLink } from "lucide-react";

const ACCOUNT_URL =
	import.meta.env.VITE_CLERK_SYNC_HOST ?? "https://clerk.merchbase.co";

export const AccessCard = () => (
	<div>
		<div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
			<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
				Centralized access
			</p>
			<span className="size-1.5 rounded-full bg-success" />
		</div>
		<div className="px-3 py-3">
			<p className="text-xs text-muted-foreground">
				RankWrangler uses your Merchbase account for web sessions and API credentials.
				Credentials stay in Clerk and the platform secure store.
			</p>
			<a
				className="mt-3 inline-flex h-7 w-full items-center justify-center gap-2 rounded-sm border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
				href={ACCOUNT_URL}
				rel="noreferrer"
				target="_blank"
			>
				Manage API access
				<ExternalLink className="size-3" />
			</a>
		</div>
	</div>
);
