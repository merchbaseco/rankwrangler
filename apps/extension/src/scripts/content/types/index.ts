// Core product information from API
export interface ProductInfo {
	asin: string;
	isMerchListing: boolean | null;
	amazonListingStatus: "active" | "deleted";
	dateFirstAvailable: string | null;
	rootCategoryBsr: number | null;
	rootCategoryDisplayName: string | null;
	thumbnail:
		| { status: "pending" }
		| { status: "available"; url: string }
		| { status: "unavailable" };
	freshness: {
		stale: boolean;
		updatedAt: string | null;
	};
}

export interface FetchProductInfoMessage {
	type: "fetchProductInfo";
	asin: string;
	marketplaceId: string;
}

export interface ProductHistoryPoint {
	categoryId: number;
	categoryName: string | null;
	observedAt: string;
	keepaMinutes: number;
	value: number | null;
	isMissing: boolean;
}

export interface ProductHistory {
	marketplaceId: string;
	asin: string;
	metric:
		| "bsrMain"
		| "bsrCategory"
		| "priceAmazon"
		| "priceNew"
		| "priceNewFba";
	latestImportAt: string | null;
	categoryNames: Record<string, string>;
	points: ProductHistoryPoint[];
	collecting: boolean;
	syncTriggered: boolean;
}

export interface FetchProductHistoryMessage {
	type: "fetchProductHistory";
	asin: string;
	marketplaceId: string;
}

export interface ProductInfoResponse {
	success: boolean;
	data?: ProductInfo;
	error?: string;
}

export interface ProductHistoryResponse {
	success: boolean;
	data?: ProductHistory;
	error?: string;
}

// BSR information for display
export interface BSRInfo {
	rank: string;
	category: string;
	dateFirstAvailable: string;
}

// Cached BSR data with timestamp
export interface CachedBSR {
	rank: string;
	category: string;
	dateFirstAvailable: string;
	timestamp: number;
}

// Cache storage structure
export interface BSRCache {
	[asin: string]: CachedBSR;
}

// Extension statistics
export interface Stats {
	totalRequests: number;
	liveSuccessCount: number;
	cacheSuccessCount: number;
	failureCount: number;
}

export interface GetAuthStateMessage {
	type: "getAuthState";
}

export interface OpenAccountMessage {
	type: "openAccount";
}

export interface ToggleDebugModeMessage {
	type: "toggleDebugMode";
	debugMode: boolean;
}

export interface ClearCacheMessage {
	type: "clearCache";
}

export interface CacheClearedNotification {
	type: "cacheCleared";
	cacheSize: number;
	queueCount: number;
}

export type BackgroundMessage =
	| FetchProductInfoMessage
	| FetchProductHistoryMessage
	| { type: "ping" }
	| GetAuthStateMessage
	| OpenAccountMessage
	| ToggleDebugModeMessage
	| ClearCacheMessage;

// API response type
export interface StatsResponse {
	stats?: Stats;
	queueCount?: number;
}

export interface AuthStateResponse {
	success: boolean;
	state?:
		| { status: "signed-out"; email: null; error?: undefined }
		| { status: "signed-in"; email: string | null; error?: undefined }
		| { status: "denied"; email: null; error: string };
	error?: string;
}

export interface ClearCacheResponse {
	success: boolean;
	error?: string;
	cacheSize?: number;
	queueCount?: number;
}

// Constants
export const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
export const DEFAULT_MARKETPLACE_ID = "ATVPDKIKX0DER"; // US marketplace
export const API_RATE_LIMIT = 2; // requests per second
