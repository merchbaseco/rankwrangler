const ASIN_REGEX = /^[A-Z0-9]{10}$/;

const SEARCH_PRODUCT_SELECTOR_PARTS = [
	'[data-component-type="s-search-result"][data-asin]:not([data-asin=""])',
	'[data-cel-widget^="search_result_"][data-asin]:not([data-asin=""])',
] as const;

export const SEARCH_PRODUCT_SELECTOR = SEARCH_PRODUCT_SELECTOR_PARTS.join(", ");

export const isValidAsin = (asin: string | null): asin is string => {
	return Boolean(asin && asin.length === 10 && ASIN_REGEX.test(asin));
};

export const getSearchProductsFromElement = (
	element: HTMLElement
): HTMLElement[] => {
	return element.matches(SEARCH_PRODUCT_SELECTOR)
		? [element]
		: Array.from(
				element.querySelectorAll<HTMLElement>(SEARCH_PRODUCT_SELECTOR)
			);
};

export const getSearchProductsFromMutationNode = (
	element: HTMLElement
): HTMLElement[] => {
	const candidates = new Set<HTMLElement>(
		getSearchProductsFromElement(element)
	);
	const parentCard = element.closest<HTMLElement>(SEARCH_PRODUCT_SELECTOR);
	if (parentCard) {
		candidates.add(parentCard);
	}

	return Array.from(candidates);
};
