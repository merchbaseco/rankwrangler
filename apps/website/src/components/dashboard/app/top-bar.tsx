import { Moon, Settings, Sun, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';

export const TopBar = ({
	onOpenSettings,
	onToggleTheme,
	lifetimeLookupCount,
	theme,
	usageLimit,
	usageToday,
}: {
	onOpenSettings: () => void;
	onToggleTheme: (event: React.MouseEvent<HTMLButtonElement>) => void;
	lifetimeLookupCount: number | null;
	theme: 'light' | 'dark' | 'system';
	usageLimit: number | null;
	usageToday: number | null;
}) => {
	const usageText =
		usageToday === null || usageLimit === null
			? '--'
			: usageLimit === -1
				? `${formatNumber(usageToday)} / Unlimited`
				: `${formatNumber(usageToday)} / ${formatNumber(usageLimit)}`;

	return (
		<div className="shrink-0 border-b border-border bg-card px-4 py-2">
			<div className="text-muted-foreground flex items-center gap-4 text-xs font-mono">
				<span className="flex items-center gap-2">
					<img src="/cowboy-hat.png" alt="" className="size-6" />
					<span className="text-sm font-bold tracking-wide text-amber-800">RANKWRANGLER</span>
				</span>
				<span className="text-border">|</span>
				<span className="flex items-center gap-1.5">
					<span className="relative flex size-2.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
						<span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
					</span>
					<span className="font-medium text-emerald-600">CONNECTED</span>
				</span>
				<div className="ml-auto flex items-center gap-4">
					<span>
						API Usage: <span className="font-medium text-foreground">{usageText}</span>
					</span>
					<span className="text-border">|</span>
					<span>
						Total Lookups:{' '}
						<span className="font-medium text-foreground">
							{lifetimeLookupCount === null ? '--' : formatNumber(lifetimeLookupCount)}
						</span>
					</span>
				</div>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:text-foreground"
						onClick={onToggleTheme}
					>
						{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:text-foreground"
						onClick={onOpenSettings}
					>
						<Settings className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:text-foreground"
						onClick={onOpenSettings}
					>
						<UserCircle className="size-4" />
					</Button>
				</div>
			</div>
		</div>
	);
};
