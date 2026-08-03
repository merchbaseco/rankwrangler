import type { RouterOutputs } from "@/lib/trpc";

export type CatalogQuery =
	RouterOutputs["api"]["app"]["catalog"]["query"]["get"];
export type CatalogRun =
	RouterOutputs["api"]["app"]["catalog"]["run"]["get"];
export type CatalogResult = CatalogRun["results"][number];
export type CatalogRunMetadata =
	RouterOutputs["api"]["app"]["catalog"]["run"]["list"]["items"][number];
