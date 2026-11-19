const AMAZON_IMAGE_HOST_RE = /^images-[a-z]+\.ssl-images-amazon\.com$/u;

/** Whether a URL is an https Amazon product-image URL, the only images RankWrangler fetches. */
export const isAmazonImageUrl = (value: string) => {
    try {
        const url = new URL(value);
        return (
            url.protocol === 'https:' &&
            (url.hostname === 'm.media-amazon.com' || AMAZON_IMAGE_HOST_RE.test(url.hostname))
        );
    } catch {
        return false;
    }
};
