import { browser } from "webextension-polyfill-ts";
import { ProductCache } from "@/scripts/db/product-cache";
import { ProductRequestTracker } from "@/scripts/db/product-request-tracker";
import type { Product, ProductIdentifier } from "@/scripts/types/product";

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const ASIN_URL_PATTERNS = [
	/\/dp\/([A-Z0-9]{10})/,
	/\/gp\/product\/([A-Z0-9]{10})/,
];
const PRODUCT_DETAIL_PATH_REGEX = /\/dp\/|\/gp\/product\//;
const SEARCH_PATH_REGEX = /^\/s(?:$|\/)/;
const SEARCH_RESULT_SELECTOR =
	'[data-component-type="s-search-result"][data-asin]:not([data-asin=""])';
const PRODUCT_DETAIL_SELECTOR =
	"#alternativeOfferEligibilityMessaging_feature_div";
const QUERY_PARAM_ALLOWLIST = [
	"k",
	"keywords",
	"page",
	"qid",
	"ref",
	"rh",
	"s",
	"crid",
	"sprefix",
	"i",
	"language",
	"currency",
];

const MAX_EVENTS = 250;
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 30;
const MAX_OBJECT_KEYS = 60;
const MAX_SANITIZE_DEPTH = 5;
const MAX_PAGE_EVENT_EXPORT = 120;
const MAX_SEARCH_SAMPLE = 20;
const MAX_ASIN_SAMPLE = 50;

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
		lastFetched: string | null;
	};
}

const pushBounded = <T>(target: T[], value: T, max: number): void => {
	target.push(value);
	if (target.length > max) {
		target.splice(0, target.length - max);
	}
};

const truncateString = (
	value: string,
	maxLength = MAX_STRING_LENGTH
): string => {
	if (value.length <= maxLength) {
		return value;
	}

	const remainingLength = value.length - maxLength;
	return `${value.slice(0, maxLength)}... [truncated ${remainingLength} chars]`;
};

const sanitizeUnknown = (value: unknown, depth = 0): unknown => {
	if (value == null) {
		return value;
	}

	if (typeof value === "string") {
		return truncateString(value);
	}

	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		typeof value === "bigint"
	) {
		return value;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: truncateString(value.message),
			stack: value.stack ? truncateString(value.stack) : undefined,
		};
	}

	if (depth >= MAX_SANITIZE_DEPTH) {
		return "[truncated:depth-limit]";
	}

	if (Array.isArray(value)) {
		const items = value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => sanitizeUnknown(item, depth + 1));
		if (value.length > MAX_ARRAY_ITEMS) {
			items.push(`[truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
		}
		return items;
	}

	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>);
		const sanitized: Record<string, unknown> = {};

		for (const [key, nestedValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
			sanitized[key] = sanitizeUnknown(nestedValue, depth + 1);
		}

		if (entries.length > MAX_OBJECT_KEYS) {
			sanitized.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
		}

		return sanitized;
	}

	return String(value);
};

const maskLicenseKey = (value: string): string => {
	if (value.length <= 8) {
		return value;
	}
	return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const getPageType = (
	pathname: string
): "product_detail" | "search_results" | "other" => {
	if (PRODUCT_DETAIL_PATH_REGEX.test(pathname)) {
		return "product_detail";
	}

	if (SEARCH_PATH_REGEX.test(pathname)) {
		return "search_results";
	}

	return "other";
};

const extractAsinFromUrl = (url: string): string | null => {
	for (const pattern of ASIN_URL_PATTERNS) {
		const match = url.match(pattern);
		if (match?.[1] && ASIN_REGEX.test(match[1])) {
			return match[1];
		}
	}

	return null;
};

const getSearchResultSummary = () => {
	const cards = Array.from(
		document.querySelectorAll<HTMLElement>(SEARCH_RESULT_SELECTOR)
	);
	const samples = cards.slice(0, MAX_SEARCH_SAMPLE).map((card, index) => {
		const asin = card.getAttribute("data-asin");
		return {
			index,
			asin,
			hasRankWranglerBadge: Boolean(card.querySelector(".rw-bsr-badge")),
			hasTitleRecipe: Boolean(card.querySelector('[data-cy="title-recipe"]')),
			dataIndex: card.getAttribute("data-index"),
			dataComponentId: card.getAttribute("data-component-id"),
		};
	});

	const uniqueAsins = [
		...new Set(cards.map((card) => card.getAttribute("data-asin"))),
	].filter((asin): asin is string => Boolean(asin && ASIN_REGEX.test(asin)));
	const uniqueAsinSample = uniqueAsins.slice(0, MAX_ASIN_SAMPLE);

	return {
		cardCount: cards.length,
		uniqueAsinCount: uniqueAsins.length,
		uniqueAsinSample,
		cardSample: samples,
	};
};

const getQueryParams = (url: URL): Record<string, string> => {
	const result: Record<string, string> = {};

	for (const key of QUERY_PARAM_ALLOWLIST) {
		const value = url.searchParams.get(key);
		if (value) {
			result[key] = truncateString(value, 300);
		}
	}

	if (Object.keys(result).length > 0) {
		return result;
	}

	for (const [key, value] of Array.from(url.searchParams.entries()).slice(
		0,
		20
	)) {
		result[key] = truncateString(value, 300);
	}

	return result;
};

const getPageSummary = () => {
	const url = new URL(window.location.href);
	const detailAsin = extractAsinFromUrl(url.href);
	const pageType = getPageType(url.pathname);
	const title = document.title?.trim() ?? "";
	const h1Text =
		document.querySelector("h1")?.textContent?.trim().replace(/\s+/g, " ") ??
		"";
	const canonicalHref =
		document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
		null;
	const badgeCount = document.querySelectorAll(".rw-bsr-badge").length;
	const productDetailBadgeCount = document.querySelectorAll(
		".rw-product-detail-badge"
	).length;
	const dataAsins = [
		...new Set(
			Array.from(document.querySelectorAll<HTMLElement>("[data-asin]")).map(
				(element) => element.getAttribute("data-asin")
			)
		),
	].filter((asin): asin is string => Boolean(asin && ASIN_REGEX.test(asin)));
	const dataAsinSample = dataAsins.slice(0, MAX_ASIN_SAMPLE);

	return {
		pageType,
		url: url.href,
		hostname: url.hostname,
		pathname: url.pathname,
		queryParams: getQueryParams(url),
		referrer: document.referrer,
		title: truncateString(title, 400),
		h1Text: truncateString(h1Text, 400),
		canonicalHref,
		detailAsin,
		amazonAsinSample: dataAsinSample,
		amazonAsinCount: dataAsins.length,
		documentState: {
			readyState: document.readyState,
			visibilityState: document.visibilityState,
			language: document.documentElement.lang,
		},
		viewport: {
			width: window.innerWidth,
			height: window.innerHeight,
			scrollX: window.scrollX,
			scrollY: window.scrollY,
			devicePixelRatio: window.devicePixelRatio,
		},
		injectionState: {
			contentRootPresent: Boolean(
				document.getElementById("rankwrangler-content-root")
			),
			searchBadgeCount: badgeCount,
			productDetailBadgeCount,
			productDetailTargetPresent: Boolean(
				document.querySelector(PRODUCT_DETAIL_SELECTOR)
			),
			titleRecipeCount: document.querySelectorAll('[data-cy="title-recipe"]')
				.length,
		},
		searchResultSummary: getSearchResultSummary(),
	};
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
						lastFetched: cachedProduct.metadata.lastFetched ?? null,
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
		browser.storage.local.get(["debugMode", "license", "reactRootsCount"]),
		ProductCache.getCacheSize(),
		ProductRequestTracker.getRequestsInProgressCount(),
		ProductRequestTracker.getRequestsInProgress(50),
		ProductCache.getCacheEntries(50),
	]);

	const licenseState =
		storageState.license && typeof storageState.license === "object"
			? {
					isValid: Boolean(
						(storageState.license as { isValid?: boolean }).isValid
					),
					email:
						typeof (storageState.license as { email?: string }).email ===
						"string"
							? (storageState.license as { email: string }).email
							: null,
					usage:
						typeof (storageState.license as { usage?: number }).usage ===
						"number"
							? (storageState.license as { usage: number }).usage
							: null,
					usageLimit:
						typeof (storageState.license as { usageLimit?: number })
							.usageLimit === "number"
							? (storageState.license as { usageLimit: number }).usageLimit
							: null,
					keyPreview:
						typeof (storageState.license as { key?: string }).key === "string"
							? maskLicenseKey((storageState.license as { key: string }).key)
							: null,
				}
			: null;

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
		license: licenseState,
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
