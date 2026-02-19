import { UserButton } from "@clerk/clerk-react";
import { BGPattern } from "@/components/ui/bg-pattern";

interface AppShellProps {
	sidebar: React.ReactNode;
	sidebarHeaderActions?: React.ReactNode;
	children: React.ReactNode;
}

export function AppShell({
	sidebar,
	sidebarHeaderActions,
	children,
}: AppShellProps) {
	return (
		<div className="h-screen overflow-hidden bg-background p-1.5 lg:p-2">
			<div className="flex h-[calc(100vh-12px)] flex-col gap-1.5 lg:h-[calc(100vh-16px)] lg:flex-row lg:gap-2">
				{/* Left dark panel — skinny sidebar */}
				<aside className="panel-dark flex w-full shrink-0 flex-col overflow-hidden rounded-2xl p-6 lg:w-[380px] lg:min-w-[370px] lg:max-w-[440px] lg:p-7">
					<BGPattern
						variant="grid"
						size={28}
						fill="rgba(245, 240, 235, 0.04)"
						mask="fade-edges"
					/>

					{/* Top row: badges + actions — matches search bar height */}
					<div className="relative z-10 flex items-center gap-1.5 rounded-xl border border-[rgba(245,240,235,0.08)] bg-[rgba(245,240,235,0.03)] px-4 py-3">
						<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
							<span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
							Live
						</span>
						<span className="rounded-full border border-[rgba(245,240,235,0.12)] px-2 py-0.5 font-mono text-[10px] text-[#A89880]">
							v0.1.3
						</span>
						<div className="ml-auto flex items-center gap-2">
							{sidebarHeaderActions}
							<UserButton
								appearance={{
									elements: {
										avatarBox: "w-7 h-7",
									},
								}}
							/>
						</div>
					</div>

					{/* Brand */}
					<h1 className="relative z-10 mt-5 font-display text-4xl font-black tracking-tight">
						RankWrangler
					</h1>

					{/* Spacer pushes content to bottom */}
					<div className="flex-1" />

					{/* Bottom: stats + license */}
					<div className="relative z-10">{sidebar}</div>
				</aside>

				{/* Right content area */}
				<main className="flex min-h-0 flex-1 flex-col pt-6 lg:pt-7">
					{children}
				</main>
			</div>
		</div>
	);
}
