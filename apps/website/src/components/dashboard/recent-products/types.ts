import type { ProductThumbnail } from "@/components/dashboard/product-thumbnail";
import type { ProductFreshness } from "@/components/dashboard/product-history-panel/types";

export type FilterState = {
	bsrRange: [number, number] | null;
	marketplaceIds: string[];
	lastUpdated: "all" | "24h" | "7d" | "30d";
};

export type Product = {
	asin: string;
	title: string | null;
	thumbnail: ProductThumbnail;
	brand: string | null;
	bullet1: string | null;
	bullet2: string | null;
	marketplaceId: string;
	rootCategoryBsr: number | null;
	dateFirstAvailable: string | null;
	isMerchListing: boolean | null;
	isUnavailable: boolean;
	facets: Array<{ facet: string; name: string }>;
	updatedAt: string;
	updatedAtMs: number;
};

export type SelectedHistoryProduct = {
	asin: string;
	marketplaceId: string;
	isUnavailable: boolean;
	title: string | null;
	thumbnail: ProductThumbnail;
	brand: string | null;
	facets: Array<{ facet: string; name: string }>;
	dateFirstAvailable: string | null;
	rootCategoryBsr: number | null;
	rootCategoryDisplayName: string | null;
	isMerchListing: boolean | null;
	freshness: ProductFreshness;
};

export const MARKETPLACE_FLAGS: Record<string, string> = {
	ATVPDKIKX0DER: "🇺🇸",
	A1F83G8C2ARO7P: "🇬🇧",
	A1PA6795UKMFR9: "🇩🇪",
	A13V1IB3VIYZZH: "🇫🇷",
	A1VC38T7YXB528: "🇯🇵",
};

export const LAST_UPDATED_HOURS = {
	"24h": 24,
	"7d": 168,
	"30d": 720,
} as const;
