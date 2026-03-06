import { useClerk, useUser } from "@clerk/clerk-react";
import {
	Activity,
	BarChart3,
	Bell,
	Key,
	LogOut,
	Monitor,
	Moon,
	Sun,
	User,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ApiKeyCard } from "@/components/dashboard/api-key-card";
import { KeepaMetricsPanel } from "@/components/dashboard/keepa-metrics-panel";
import { ProductFacetMetricsPanel } from "@/components/dashboard/product-facet-metrics-panel";
import { SpApiMetricsPanel } from "@/components/dashboard/spapi-metrics-panel";
import { TopSearchTermsMetricsPanel } from "@/components/dashboard/top-search-terms-metrics-panel";
import { UsageCard } from "@/components/dashboard/usage-card";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBackdrop,
	DialogClose,
	DialogPopup,
	DialogPortal,
	DialogTitle,
	DialogViewport,
} from "@/components/ui/dialog";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

type SettingsPage =
	| "general"
	| "api"
	| "notifications"
	| "account"
	| "metrics-keepa"
	| "metrics-spapi"
	| "metrics-top-search-terms"
	| "metrics-facets";

type NavItem = { key: SettingsPage; label: string; icon: typeof Key };

const BASE_SETTINGS_NAV: NavItem[] = [
	{ key: "general", label: "General", icon: BarChart3 },
	{ key: "api", label: "API Keys & Usage", icon: Key },
	{ key: "notifications", label: "Notifications", icon: Bell },
	{ key: "account", label: "Account", icon: User },
];

const METRICS_NAV: NavItem[] = [
	{ key: "metrics-keepa", label: "Keepa", icon: Activity },
	{ key: "metrics-spapi", label: "SP-API", icon: Activity },
	{
		key: "metrics-top-search-terms",
		label: "Top Search Terms",
		icon: Activity,
	},
	{ key: "metrics-facets", label: "Facets", icon: Activity },
];

const isMetricsPage = (page: SettingsPage) => page.startsWith("metrics-");

export const SettingsModal = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const [page, setPage] = useState<SettingsPage>("general");
	const { isAdmin } = useAdminAccess();

	const pageTitle = useMemo(() => {
		const all = [...BASE_SETTINGS_NAV, ...METRICS_NAV];
		return all.find((item) => item.key === page)?.label ?? "";
	}, [page]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogViewport>
					<DialogPopup className="flex h-[min(820px,92vh)] w-[min(1200px,96vw)]">
						<nav className="flex w-[200px] shrink-0 flex-col border-r border-border bg-sidebar p-2">
							<DialogTitle className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Settings
							</DialogTitle>
							{BASE_SETTINGS_NAV.map((item) => (
								<Button
									key={item.key}
									onClick={() => setPage(item.key)}
									className={cn(
										"h-auto justify-start gap-2.5 rounded-sm px-2.5 py-1.5 text-sm",
										page === item.key
											? "bg-accent font-medium text-foreground"
											: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
									)}
									size="sm"
									variant="ghost"
								>
									<item.icon className="size-3.5" />
									{item.label}
								</Button>
							))}

							{isAdmin && (
								<>
									<p className="mt-3 px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
										Metrics
									</p>
									{METRICS_NAV.map((item) => (
										<Button
											key={item.key}
											onClick={() => setPage(item.key)}
											className={cn(
												"h-auto justify-start gap-2.5 rounded-sm px-2.5 py-1.5 text-sm",
												page === item.key
													? "bg-accent font-medium text-foreground"
													: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
											)}
											size="sm"
											variant="ghost"
										>
											<item.icon className="size-3.5" />
											{item.label}
										</Button>
									))}
								</>
							)}
						</nav>

						<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
							<div className="flex items-center justify-between border-b border-border px-5 py-3">
								<h2 className="text-sm font-semibold text-foreground">
									{pageTitle}
								</h2>
								<DialogClose />
							</div>

							<div
								className={cn(
									"flex-1",
									isMetricsPage(page) ? "overflow-hidden" : "overflow-y-auto",
								)}
							>
								{page === "general" ? <GeneralSettings /> : null}
								{page === "api" ? <ApiSettings /> : null}
								{page === "notifications" ? <NotificationSettings /> : null}
								{page === "account" ? <AccountSettings /> : null}
								{page === "metrics-keepa" ? <KeepaMetricsPanel /> : null}
								{page === "metrics-spapi" ? <SpApiMetricsPanel /> : null}
								{page === "metrics-top-search-terms" ? (
									<TopSearchTermsMetricsPanel />
								) : null}
								{page === "metrics-facets" ? (
									<ProductFacetMetricsPanel />
								) : null}
							</div>
						</div>
					</DialogPopup>
				</DialogViewport>
			</DialogPortal>
		</Dialog>
	);
};

const THEME_OPTIONS = [
	{ key: "light" as const, label: "Light", icon: Sun },
	{ key: "dark" as const, label: "Dark", icon: Moon },
	{ key: "system" as const, label: "System", icon: Monitor },
];

const GeneralSettings = () => {
	const { theme, setTheme } = useTheme();

	return (
		<div>
			<div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
				<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					Appearance
				</p>
			</div>
			<div className="grid grid-cols-3 border-b border-border">
				{THEME_OPTIONS.map((option, i) => (
					<Button
						key={option.key}
						onClick={() => setTheme(option.key)}
						className={cn(
							"h-auto flex-col gap-2 rounded-none p-4",
							i < THEME_OPTIONS.length - 1 && "border-r border-border",
							theme === option.key
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
						)}
						size="sm"
						variant="ghost"
					>
						<option.icon className="size-5" />
						<span className="text-xs font-medium">{option.label}</span>
					</Button>
				))}
			</div>
		</div>
	);
};

const ApiSettings = () => (
	<div>
		<UsageCard />
		<div className="border-t border-border">
			<ApiKeyCard />
		</div>
	</div>
);

const NotificationSettings = () => (
	<div>
		<div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
			<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
				Alerts
			</p>
		</div>
		<div className="px-3 py-3">
			<p className="text-xs text-muted-foreground">
				Notification preferences coming soon.
			</p>
		</div>
	</div>
);

const AccountSettings = () => {
	const { user } = useUser();
	const { signOut } = useClerk();

	const name = user?.fullName ?? user?.firstName ?? "User";
	const email = user?.primaryEmailAddress?.emailAddress;
	const avatarUrl = user?.imageUrl;
	const provider = user?.externalAccounts?.[0]?.provider;
	const providerLabel = provider
		? provider.charAt(0).toUpperCase() + provider.slice(1)
		: null;

	return (
		<div>
			<div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
				<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					Profile
				</p>
			</div>
			<div className="flex items-center gap-4 px-3 py-3">
				{avatarUrl ? (
					<img
						src={avatarUrl}
						alt={name}
						className="size-10 rounded-full border border-border"
					/>
				) : (
					<div className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
						<User className="size-4" />
					</div>
				)}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold text-foreground">{name}</p>
					{email ? (
						<p className="mt-0.5 text-xs text-muted-foreground">{email}</p>
					) : null}
					{providerLabel ? (
						<p className="mt-0.5 font-mono text-xs text-muted-foreground">
							via {providerLabel}
						</p>
					) : null}
				</div>
			</div>

			<div className="border-t border-border">
				<div className="flex items-center justify-between border-b border-border bg-accent px-3 py-2">
					<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
						Actions
					</p>
				</div>
				<div className="px-3 py-3">
					<Button
						variant="destructive-outline"
						size="sm"
						onClick={() => {
							void signOut();
						}}
					>
						<LogOut className="size-3.5" />
						Sign out
					</Button>
				</div>
			</div>
		</div>
	);
};
