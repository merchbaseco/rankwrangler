export const readAmazonSearchKeyword = (pageUrl: string): string | null => {
	const url = new URL(pageUrl);
	if (url.hostname !== "amazon.com" && !url.hostname.endsWith(".amazon.com"))
		return null;
	if (!/^\/s(?:\/|$)/u.test(url.pathname) && url.pathname !== "/gp/search")
		return null;
	const term = url.searchParams.get("k")?.trim().replace(/\s+/gu, " ");
	return term && term.length <= 200 ? term : null;
};
