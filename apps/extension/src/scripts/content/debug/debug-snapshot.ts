import { browser } from "webextension-polyfill-ts";
import { ProductCache } from "@/scripts/db/product-cache";
import { ProductRequestTracker } from "@/scripts/db/product-request-tracker";
import type { Product, ProductIdentifier } from "@/scripts/types/product";
import { getPageSummary } from "./debug-snapshot-page";
import { sanitizeUnknown, truncateString } from "./debug-snapshot-utils";

const MAX_EVENTS = 250;
const MAX_PAGE_EVENT_EXPORT = 120;

const createSessionId = (): string => {
	if (typeof globalThis.crypto?.randomUUID === "function") {
		return globalThis.crypto.randomUUID();
	}

	return `rw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createRequestId = (): string => {
	return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const pageSessionId = createSessionId();
const productRequestEvents: ProductRequestEvent[] = [];
const cacheLookupEvents: CacheLookupEvent[] = [];

export interface DebugWidgetStats {
	debugMode: boolean;
	cacheSize: number;
	queueCount: number;
	reactRootsCount: number;
}

interface ProductRequestTrace {
	requestId: string;
	asin: string;
	marketplaceId: string;
	startedAt: string;
	performanceStartedAt: number;
	pageUrl: string;
	pagePath: string;
}

type ProductRequestStatus = "success" | "error" | "no_response";

interface ProductRequestEvent {
	requestId: string;
	asin: string;
	marketplaceId: string;
	status: ProductRequestStatus;
	startedAt: string;
	completedAt: string;
	durationMs: number;
	pageUrl: string;
	pagePath: string;
	response?: unknown;
	errorMessage?: string;
}

interface ProductRequestCompletion {
	status: ProductRequestStatus;
	response?: unknown;
	errorMessage?: string;
}

type CacheLookupResult = "hit" | "miss";

interface CacheLookupEvent {
	asin: string;
	marketplaceId: string;
	result: CacheLookupResult;
	timestamp: string;
	pageUrl: string;
	pagePath: string;
	productSummary?: {
		hasRankData: boolean;
		metadataSuccess: boolean;
		metadataCached: boolean;
		thumbnailStatus: "pending" | "available" | "unavailable" | null;
	};
}

const pushBounded = <T>(target: T[], value: T, max: number): void => {
	target.push(value);
	if (target.length > max) {
		target.splice(0, target.length - max);
	}
};

const getProductRequestSummary = () => {
	const currentPath = window.location.pathname;
	const currentPathEvents = productRequestEvents.filter(
		(event) => event.pagePath === currentPath
	);

	return {
		recentEvents: productRequestEvents.slice(-MAX_PAGE_EVENT_EXPORT),
		recentCurrentPathEvents: currentPathEvents.slice(-MAX_PAGE_EVENT_EXPORT),
		totalBufferedEvents: productRequestEvents.length,
	};
};

const getCacheLookupSummary = () => {
	const currentPath = window.location.pathname;
	const currentPathEvents = cacheLookupEvents.filter(
		(event) => event.pagePath === currentPath
	);

	return {
		recentEvents: cacheLookupEvents.slice(-MAX_PAGE_EVENT_EXPORT),
		recentCurrentPathEvents: currentPathEvents.slice(-MAX_PAGE_EVENT_EXPORT),
		totalBufferedEvents: cacheLookupEvents.length,
	};
};

export const startProductRequestTrace = (
	productIdentifier: ProductIdentifier
): ProductRequestTrace => {
	return {
		requestId: createRequestId(),
		asin: productIdentifier.asin,
		marketplaceId: productIdentifier.marketplaceId,
		startedAt: new Date().toISOString(),
		performanceStartedAt: performance.now(),
		pageUrl: window.location.href,
		pagePath: window.location.pathname,
	};
};

export const finishProductRequestTrace = (
	trace: ProductRequestTrace,
	completion: ProductRequestCompletion
): void => {
	const completedAt = new Date().toISOString();
	const durationMs = Math.max(
		0,
		Math.round(performance.now() - trace.performanceStartedAt)
	);

	pushBounded(
		productRequestEvents,
		{
			requestId: trace.requestId,
			asin: trace.asin,
			marketplaceId: trace.marketplaceId,
			status: completion.status,
			startedAt: trace.startedAt,
			completedAt,
			durationMs,
			pageUrl: trace.pageUrl,
			pagePath: trace.pagePath,
			response: sanitizeUnknown(completion.response),
			errorMessage: completion.errorMessage
				? truncateString(completion.errorMessage)
				: undefined,
		},
		MAX_EVENTS
	);
};

export const recordCacheLookup = (
	productIdentifier: ProductIdentifier,
	result: CacheLookupResult,
	cachedProduct?: Product
): void => {
	const hasRankData =
		typeof cachedProduct?.rootCategoryBsr === "number" &&
		Boolean(cachedProduct?.rootCategoryDisplayName);

	pushBounded(
		cacheLookupEvents,
		{
			asin: productIdentifier.asin,
			marketplaceId: productIdentifier.marketplaceId,
			result,
			timestamp: new Date().toISOString(),
			pageUrl: window.location.href,
			pagePath: window.location.pathname,
			productSummary: cachedProduct
				? {
						hasRankData,
						metadataSuccess: Boolean(cachedProduct.metadata.success),
						metadataCached: Boolean(cachedProduct.metadata.cached),
						thumbnailStatus: cachedProduct.metadata.thumbnailStatus ?? null,
					}
				: undefined,
		},
		MAX_EVENTS
	);
};

const copyToClipboard = async (text: string): Promise<void> => {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
		return;
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "true");
	textarea.style.position = "fixed";
	textarea.style.top = "-10000px";
	textarea.style.left = "-10000px";
	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();

	const copied = document.execCommand("copy");
	document.body.removeChild(textarea);

	if (!copied) {
		throw new Error(
			"Clipboard API unavailable and fallback copy command failed."
		);
	}
};

export const buildDebugDump = async (
	stats: DebugWidgetStats
): Promise<string> => {
	const now = new Date();
	const [
		storageState,
		cacheSize,
		queueCount,
		requestsInProgress,
		cacheEntries,
	] = await Promise.all([
		browser.storage.local.get(["debugMode", "reactRootsCount"]),
		ProductCache.getCacheSize(),
		ProductRequestTracker.getRequestsInProgressCount(),
		ProductRequestTracker.getRequestsInProgress(50),
		ProductCache.getCacheEntries(50),
	]);

	const payload = {
		schemaVersion: 1,
		generatedAt: now.toISOString(),
		pageSessionId,
		extension: {
			name: browser.runtime.getManifest().name,
			version: browser.runtime.getManifest().version,
		},
		runtime: {
			debugModeWidgetState: stats.debugMode,
			debugModeStorageState: Boolean(storageState.debugMode),
			cacheSizeFromWidget: stats.cacheSize,
			cacheSizeLive: cacheSize,
			queueCountFromWidget: stats.queueCount,
			queueCountLive: queueCount,
			reactRootsCountFromWidget: stats.reactRootsCount,
			reactRootsStorageState:
				typeof storageState.reactRootsCount === "object"
					? sanitizeUnknown(storageState.reactRootsCount)
					: null,
			browserLocale: navigator.language,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			userAgent: navigator.userAgent,
			platform: navigator.platform,
		},
		auth: "background-managed",
		page: getPageSummary(),
		requests: {
			productFetch: getProductRequestSummary(),
			inProgress: requestsInProgress,
		},
		cache: {
			lookups: getCacheLookupSummary(),
			entries: cacheEntries,
		},
	};

	return (
		`RankWrangler Debug Dump\nGenerated: ${now.toISOString()}\n` +
		`URL: ${window.location.href}\n\n${JSON.stringify(payload, null, 2)}\n`
	);
};

export const copyDebugDumpToClipboard = async (
	stats: DebugWidgetStats
): Promise<{ characterCount: number }> => {
	const debugDump = await buildDebugDump(stats);
	await copyToClipboard(debugDump);
	return { characterCount: debugDump.length };
};
