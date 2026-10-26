import { Activity, BarChart3, Bell, Key, RefreshCw, User } from "lucide-react";
import { useMemo, useState } from "react";
import { KeepaMetricsPanel } from "@/components/dashboard/keepa-metrics-panel";
import { ProductFacetMetricsPanel } from "@/components/dashboard/product-facet-metrics-panel";
import { ProductShortNameMetricsPanel } from "@/components/dashboard/product-short-name-metrics-panel";
import { ProductCutoutThumbnailMetricsPanel } from "@/components/dashboard/product-cutout-thumbnail-metrics-panel";
import {
	AccountSettings,
	ApiSettings,
	GeneralSettings,
	NotificationSettings,
} from "@/components/dashboard/settings-pages";
import { SpApiMetricsPanel } from "@/components/dashboard/spapi-metrics-panel";
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
import { cn } from "@/lib/utils";

type SettingsPage =
	| "general"
	| "api"
	| "notifications"
	| "account"
	| "metrics-keepa"
	| "metrics-spapi"
	| "metrics-facets"
	| "metrics-short-names"
	| "metrics-cutouts";

type NavItem = { key: SettingsPage; label: string; icon: typeof Key };

const BASE_SETTINGS_NAV: NavItem[] = [
	{ key: "general", label: "General", icon: BarChart3 },
	{ key: "api", label: "Access & Usage", icon: Key },
	{ key: "notifications", label: "Notifications", icon: Bell },
	{ key: "account", label: "Account", icon: User },
];

const METRICS_NAV: NavItem[] = [
	{ key: "metrics-keepa", label: "Keepa", icon: Activity },
	{ key: "metrics-spapi", label: "SP-API", icon: Activity },
	{ key: "metrics-facets", label: "Facets", icon: Activity },
	{ key: "metrics-short-names", label: "Short Names", icon: Activity },
	{ key: "metrics-cutouts", label: "Cutout Thumbnails", icon: Activity },
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
								<SettingsNavButton
									key={item.key}
									item={item}
									active={page === item.key}
									onSelect={setPage}
								/>
							))}
							{isAdmin ? (
								<>
									<p className="mt-3 px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
										Metrics
									</p>
									{METRICS_NAV.map((item) => (
										<SettingsNavButton
											key={item.key}
											item={item}
											active={page === item.key}
											onSelect={setPage}
										/>
									))}
								</>
							) : null}
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
								{page === "metrics-facets" ? (
									<ProductFacetMetricsPanel />
								) : null}
								{page === "metrics-short-names" ? (
									<ProductShortNameMetricsPanel />
								) : null}
								{page === "metrics-cutouts" ? (
									<ProductCutoutThumbnailMetricsPanel />
								) : null}
							</div>
						</div>
					</DialogPopup>
				</DialogViewport>
			</DialogPortal>
		</Dialog>
	);
};

const SettingsNavButton = ({
	item,
	active,
	onSelect,
}: {
	item: NavItem;
	active: boolean;
	onSelect: (page: SettingsPage) => void;
}) => (
	<Button
		onClick={() => onSelect(item.key)}
		className={cn(
			"h-auto justify-start gap-2.5 rounded-sm px-2.5 py-1.5 text-sm",
			active
				? "bg-accent font-medium text-foreground"
				: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
		)}
		size="sm"
		variant="ghost"
	>
		<item.icon className="size-3.5" />
		{item.label}
	</Button>
);
