import { useClerk, useUser } from "@clerk/clerk-react";
import { LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import { AccessCard } from "@/components/dashboard/access-card";
import { UsageCard } from "@/components/dashboard/usage-card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

const THEME_OPTIONS = [
	{ key: "light" as const, label: "Light", icon: Sun },
	{ key: "dark" as const, label: "Dark", icon: Moon },
	{ key: "system" as const, label: "System", icon: Monitor },
];

export const GeneralSettings = () => {
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

export const ApiSettings = () => (
	<div>
		<UsageCard />
		<div className="border-t border-border">
			<AccessCard />
		</div>
	</div>
);

export const NotificationSettings = () => (
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

export const AccountSettings = () => {
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
					{email ? <p className="mt-0.5 text-xs text-muted-foreground">{email}</p> : null}
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
