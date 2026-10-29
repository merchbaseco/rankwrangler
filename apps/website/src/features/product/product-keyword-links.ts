/** The keyword on the Keywords screen. */
export const keywordHref = (keyword: string) => `/keywords?${new URLSearchParams({ q: keyword })}`;

/** Explore narrowed to designs matching the keyword. */
export const exploreKeywordHref = (keyword: string) =>
    `/explore?${new URLSearchParams({ q: keyword })}`;
