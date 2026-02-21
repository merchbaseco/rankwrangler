import { Moon, Settings, Sun, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatNumber } from '@/lib/utils';

export const TopBar = ({
	keepaErrors,
	keepaSuccess,
	keepaTokensLeft,
	onOpenSettings,
	onToggleTheme,
	productCount,
	theme,
	usageLimit,
	usageToday,
}: {
	keepaErrors: number;
	keepaSuccess: number;
	keepaTokensLeft: number | null;
	onOpenSettings: () => void;
	onToggleTheme: (event: React.MouseEvent<HTMLButtonElement>) => void;
	productCount: number | null;
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
						Products:{' '}
						<span className="font-medium text-foreground">
							{productCount === null ? '--' : formatNumber(productCount)}
						</span>
					</span>
					<span className="text-border">|</span>
					<span>
						Keepa Credits:{' '}
						<span
							className={cn(
								'font-medium',
								typeof keepaTokensLeft === 'number' && keepaTokensLeft < 100
									? 'text-amber-600'
									: 'text-foreground',
							)}
						>
							{typeof keepaTokensLeft === 'number' ? formatNumber(keepaTokensLeft) : '--'}
						</span>
					</span>
					<span className="text-border">|</span>
					<span>
						Keepa OK (1h):{' '}
						<span className="font-medium text-emerald-600">{formatNumber(keepaSuccess)}</span>
					</span>
					<span className="text-border">|</span>
					<span>
						Keepa Err (1h):{' '}
						<span
							className={cn(
								'font-medium',
								keepaErrors > 0 ? 'text-red-600' : 'text-foreground',
							)}
						>
							{formatNumber(keepaErrors)}
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
