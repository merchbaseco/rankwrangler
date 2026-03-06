import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventLogRow } from "./logs-utils";
import { formatDateTime, formatJson } from "./logs-utils";

export const FilterGroup = <T extends string>({
	label,
	options,
	selectedValues,
	onToggle,
}: {
	label: string;
	options: readonly T[];
	selectedValues: readonly T[];
	onToggle: (value: T) => void;
}) => (
	<div className="flex items-center gap-1">
		<span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
			{label}
		</span>
		{options.map((option) => {
			const active = selectedValues.includes(option);
			return (
				<Button
					key={option}
					type="button"
					size="sm"
					variant={active ? "secondary" : "outline"}
					className="h-6 rounded-sm px-2 text-[11px] uppercase"
					onClick={() => onToggle(option)}
				>
					{option}
				</Button>
			);
		})}
	</div>
);

export const LogDetails = ({ log }: { log: EventLogRow | null }) => {
	if (!log) {
		return (
			<p className="p-3 text-xs text-muted-foreground">
				Select a row to inspect metadata.
			</p>
		);
	}

	return (
		<div className="space-y-2 p-3">
			<p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
				Log details
			</p>
			<p className="text-sm text-foreground">{log.message}</p>
			<p className="font-mono text-xs text-muted-foreground">
				{formatDateTime(log.occurredAt)} • {log.action}
			</p>
			<pre className="max-h-[420px] overflow-auto rounded-sm border border-border bg-card px-2 py-2 font-mono text-xs leading-5 text-foreground">
				{formatJson(log.detailsJson)}
			</pre>
		</div>
	);
};

export const TableHead = ({ children }: { children: ReactNode }) => (
	<th className="h-9 px-2 text-left font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
		{children}
	</th>
);

export const TableCell = ({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) => <td className={cn("px-2 py-1.5 align-middle", className)}>{children}</td>;
