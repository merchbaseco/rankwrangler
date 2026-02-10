// Core product information from API
export interface ProductInfo {
	asin: string;
	dateFirstAvailable: string | null;
	rootCategoryBsr: number | null;
	rootCategoryDisplayName: string | null;
	metadata: {
		lastFetched: string; // ISO timestamp
		cached: boolean;
	};
}

export interface FetchProductInfoMessage {
	type: "fetchProductInfo";
	asin: string;
	marketplaceId: string;
}

export interface ProductInfoResponse {
	success: boolean;
	data?: ProductInfo;
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

// License management messages
export interface ValidateLicenseMessage {
	type: "validateLicense";
	licenseKey?: string;
}

export interface SetLicenseMessage {
	type: "setLicense";
	licenseKey: string;
}

export interface RemoveLicenseMessage {
	type: "removeLicense";
}

export interface GetLicenseStatusMessage {
	type: "getLicenseStatus";
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
	| { type: "ping" }
	| ValidateLicenseMessage
	| SetLicenseMessage
	| RemoveLicenseMessage
	| GetLicenseStatusMessage
	| ToggleDebugModeMessage
	| ClearCacheMessage;

// API response type
export interface StatsResponse {
	stats?: Stats;
	queueCount?: number;
}

// License status and response types
import type { License } from "../../types/license";

export interface LicenseResponse {
	success: boolean;
	license?: License | null;
	error?: string;
}

export interface ValidationResponse {
	success: boolean;
	valid: boolean;
	error?: string;
	data?: {
		email: string;
		usage: number;
		usageLimit: number;
	};
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
