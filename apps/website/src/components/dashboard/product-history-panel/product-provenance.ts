export type ProviderProvenance = {
	lastAttemptAt: string | null;
	lastSuccessAt: string | null;
	sourceObservedAt: string | null;
	suppliedDataCategories: string[];
	latestError: string | null;
	retryAt: string | null;
};

export type ProductProvenance = {
	spApi: ProviderProvenance;
	keepa: ProviderProvenance;
};

export type ProviderProvenanceRow = {
	label: string;
	value: string;
};

export const buildProviderProvenanceRows = (
	provenance: ProviderProvenance,
): ProviderProvenanceRow[] => [
	{ label: "Last attempt", value: provenance.lastAttemptAt ?? "Unavailable" },
	{ label: "Last successful fetch", value: provenance.lastSuccessAt ?? "Unavailable" },
	{ label: "Source observation", value: provenance.sourceObservedAt ?? "Unavailable" },
	{
		label: "Supplied data",
		value:
			provenance.suppliedDataCategories.length > 0
				? provenance.suppliedDataCategories.join(", ")
				: "Unavailable",
	},
	...(provenance.latestError
		? [{ label: "Latest error", value: provenance.latestError }]
		: []),
	...(provenance.retryAt ? [{ label: "Retry", value: provenance.retryAt }] : []),
];
