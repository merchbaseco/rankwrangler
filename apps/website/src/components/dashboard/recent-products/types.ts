export type FilterState = {
	bsrRanges: Array<'top1k' | 'top10k' | 'top100k' | '100k+'>;
	marketplaceIds: string[];
	lastUpdated: 'all' | '24h' | '7d' | '30d';
};

export type Product = {
	asin: string;
	title: string | null;
	thumbnailUrl: string | null;
	brand: string | null;
	marketplaceId: string;
	rootCategoryBsr: number | null;
	lastFetched: string;
	lastFetchedMs: number;
};

export type SelectedHistoryProduct = {
	asin: string;
	marketplaceId: string;
	title: string | null;
	thumbnailUrl: string | null;
	brand: string | null;
};

export const MARKETPLACE_FLAGS: Record<string, string> = {
	ATVPDKIKX0DER: '🇺🇸',
	A1F83G8C2ARO7P: '🇬🇧',
	A1PA6795UKMFR9: '🇩🇪',
	A13V1IB3VIYZZH: '🇫🇷',
	A1VC38T7YXB528: '🇯🇵',
};

export const LAST_UPDATED_HOURS = {
	'24h': 24,
	'7d': 168,
	'30d': 720,
} as const;
