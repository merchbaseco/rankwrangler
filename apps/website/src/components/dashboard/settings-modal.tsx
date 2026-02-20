import { useClerk, useUser } from "@clerk/clerk-react";
import { Dialog } from "@base-ui-components/react/dialog";
import {
	Key,
	BarChart3,
	Bell,
	LogOut,
	Monitor,
	Moon,
	ShieldCheck,
	Sun,
	User,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AdminOperationsPanel } from "@/components/dashboard/admin-operations-panel";
import { ApiKeyCard } from "@/components/dashboard/api-key-card";
import { UsageCard } from "@/components/dashboard/usage-card";
import { Button } from "@/components/ui/button";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

type SettingsPage = "general" | "api" | "notifications" | "account" | "admin";

const BASE_SETTINGS_NAV: Array<{ key: SettingsPage; label: string; icon: typeof Key }> = [
	{ key: "general", label: "General", icon: BarChart3 },
	{ key: "api", label: "API Keys & Usage", icon: Key },
	{ key: "notifications", label: "Notifications", icon: Bell },
	{ key: "account", label: "Account", icon: User },
];

export const SettingsModal = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const [page, setPage] = useState<SettingsPage>("general");
	const { isAdmin } = useAdminAccess();

	const settingsNav = useMemo(() => {
		if (!isAdmin) return BASE_SETTINGS_NAV;
		return [
			...BASE_SETTINGS_NAV,
			{ key: "admin" as const, label: "Admin", icon: ShieldCheck },
		];
	}, [isAdmin]);

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-black/45" />
				<Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<Dialog.Popup className="flex h-[min(640px,85vh)] w-[min(900px,90vw)] overflow-hidden rounded-md border border-border bg-background shadow-lg outline-none">
						<nav className="flex w-[200px] shrink-0 flex-col border-r border-border bg-sidebar p-2">
							<Dialog.Title className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								Settings
							</Dialog.Title>
							{settingsNav.map((item) => (
								<button
									key={item.key}
									type="button"
									onClick={() => setPage(item.key)}
									className={cn(
										"flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors",
										page === item.key
											? "bg-accent font-medium text-foreground"
											: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
									)}
								>
									<item.icon className="size-3.5" />
									{item.label}
								</button>
							))}
						</nav>

						<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
							<div className="flex items-center justify-between border-b border-border px-5 py-3">
								<h2 className="text-sm font-semibold text-foreground">
									{settingsNav.find((item) => item.key === page)?.label}
								</h2>
								<Dialog.Close
									className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									aria-label="Close"
								>
									<X className="size-4" />
								</Dialog.Close>
							</div>

							<div className="flex-1 overflow-y-auto p-5">
								{page === "general" ? <GeneralSettings /> : null}
								{page === "api" ? <ApiSettings /> : null}
								{page === "notifications" ? <NotificationSettings /> : null}
								{page === "account" ? <AccountSettings /> : null}
								{page === "admin" ? <AdminSettings /> : null}
							</div>
						</div>
					</Dialog.Popup>
				</Dialog.Viewport>
			</Dialog.Portal>
		</Dialog.Root>
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
		<div className="space-y-5">
			<div>
				<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Appearance
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Choose how the dashboard looks.
				</p>
				<div className="mt-3 flex gap-2">
					{THEME_OPTIONS.map((option) => (
						<button
							key={option.key}
							type="button"
							onClick={(e) => setTheme(option.key, e)}
							className={cn(
								"flex flex-1 flex-col items-center gap-2 rounded-sm border p-3 transition-colors",
								theme === option.key
									? "border-primary bg-accent text-foreground"
									: "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground",
							)}
						>
							<option.icon className="size-5" />
							<span className="text-xs font-medium">{option.label}</span>
						</button>
					))}
				</div>
			</div>
		</div>
	);
};

const ApiSettings = () => (
	<div className="grid gap-3 md:grid-cols-2">
		<UsageCard />
		<ApiKeyCard />
	</div>
);

const NotificationSettings = () => (
	<div className="space-y-4">
		<p className="text-sm text-muted-foreground">
			Configure how you receive notifications.
		</p>
		<div className="rounded-sm border border-border p-4">
			<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
				Alerts
			</p>
			<p className="mt-2 text-sm text-muted-foreground">
				Notification preferences will appear here.
			</p>
		</div>
	</div>
);

const AdminSettings = () => (
	<AdminOperationsPanel />
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
		<div className="space-y-5">
			<div className="flex items-center gap-4 rounded-sm border border-border p-4">
				{avatarUrl ? (
					<img
						src={avatarUrl}
						alt={name}
						className="size-14 rounded-full border border-border"
					/>
				) : (
					<div className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
						<User className="size-6" />
					</div>
				)}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold text-foreground">{name}</p>
					{email ? (
						<p className="mt-0.5 text-xs text-muted-foreground">{email}</p>
					) : null}
					{providerLabel ? (
						<p className="mt-1 text-xs font-mono text-muted-foreground">
							Signed in via {providerLabel}
						</p>
					) : null}
				</div>
			</div>

			<div>
				<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Actions
				</p>
				<div className="mt-2">
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
