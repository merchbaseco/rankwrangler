import { SEARCH_PRODUCT_SELECTOR } from "../utils/search-products";
import { truncateString } from "./debug-snapshot-utils";

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const ASIN_URL_PATTERNS = [
	/\/dp\/([A-Z0-9]{10})/,
	/\/gp\/product\/([A-Z0-9]{10})/,
];
const PRODUCT_DETAIL_PATH_REGEX = /\/dp\/|\/gp\/product\//;
const SEARCH_PATH_REGEX = /^\/s(?:$|\/)/;
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
const MAX_SEARCH_SAMPLE = 20;
const MAX_ASIN_SAMPLE = 50;

export const getPageSummary = () => {
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
		document.querySelectorAll<HTMLElement>(SEARCH_PRODUCT_SELECTOR)
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
