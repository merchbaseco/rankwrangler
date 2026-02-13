const AMAZON_MERCH_SHIRT_FILTER =
    'Solid colors: 100% Cotton; Heather Grey: 90% Cotton, 10% Polyester; ' +
    'All Other Heathers: 50% Cotton, 50% Polyester Lightweight, Classic fit, ' +
    'Double-needle sleeve and bottom hem Machine wash cold with like colors, dry low heat ' +
    '-long -premium -sweatshirt -v-neck -tank 10 x 8 x 1 inches; 4.8 Ounces';

const AMAZON_MERCH_SEARCH_URL = 'https://www.amazon.com/s';

export function buildAmazonMerchShirtSearchUrl(keyword: string): string {
    const sanitizedKeyword = keyword.trim();
    const url = new URL(AMAZON_MERCH_SEARCH_URL);

    url.searchParams.set('i', 'fashion-novelty');
    url.searchParams.set('bbn', '12035955011');
    url.searchParams.set('rh', 'p_6:ATVPDKIKX0DER');
    url.searchParams.set('oq', AMAZON_MERCH_SHIRT_FILTER);
    url.searchParams.set('qid', Math.floor(Date.now() / 1000).toString());
    url.searchParams.set('ref', 'sr_pg_1');

    if (sanitizedKeyword) {
        url.searchParams.set('hidden-keywords', sanitizedKeyword);
    }

    return url.toString();
}
