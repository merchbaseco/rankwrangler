import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipPopup,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	buildProviderProvenanceRows,
	type ProductProvenance,
} from "./product-provenance";

export const ProductProvenanceTooltip = ({
	provenance,
}: {
	provenance: ProductProvenance | null | undefined;
}) => (
	<Tooltip>
		<TooltipTrigger
			render={
				<Button
					aria-label="View Product provider provenance"
					className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
					size="sm"
					variant="ghost"
				/>
			}
		>
			<Info className="size-3.5" />
		</TooltipTrigger>
		<TooltipPopup align="end" className="w-80 p-3" side="bottom">
			<div className="space-y-3">
				<p className="font-medium text-foreground">Provider provenance</p>
				<ProviderSection
					label="SP-API"
					provenance={provenance?.spApi ?? emptyProviderProvenance}
				/>
				<ProviderSection
					label="Keepa"
					provenance={provenance?.keepa ?? emptyProviderProvenance}
				/>
			</div>
		</TooltipPopup>
	</Tooltip>
);

const ProviderSection = ({
	label,
	provenance,
}: {
	label: string;
	provenance: Parameters<typeof buildProviderProvenanceRows>[0];
}) => (
	<section aria-label={`${label} provenance`} className="space-y-1.5">
		<h3 className="font-medium text-foreground">{label}</h3>
		<dl className="space-y-1 text-[11px]">
			{buildProviderProvenanceRows(provenance).map((row) => (
				<div className="grid grid-cols-[auto_1fr] gap-x-2" key={row.label}>
					<dt className="text-muted-foreground">{row.label}</dt>
					<dd className="break-words text-right text-foreground">{row.value}</dd>
				</div>
			))}
		</dl>
	</section>
);

const emptyProviderProvenance = {
	lastAttemptAt: null,
	lastSuccessAt: null,
	sourceObservedAt: null,
	suppliedDataCategories: [],
	latestError: null,
	retryAt: null,
} as const;
