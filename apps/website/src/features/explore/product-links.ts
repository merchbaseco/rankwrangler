/** Where a product opens: its RankWrangler page, or its Amazon detail page. */
export const productHref = (product: { asin: string; marketplaceId: string }) =>
    product.marketplaceId === defaultMarketplaceId
        ? `/products/${product.asin}`
        : `/products/${product.asin}?marketplace=${product.marketplaceId}`;

const defaultMarketplaceId = 'ATVPDKIKX0DER';

const amazonHosts: Readonly<Record<string, string>> = {
    A13V1IB3VIYZZH: 'www.amazon.fr',
    A1F83G8C2ARO7P: 'www.amazon.co.uk',
    A1PA6795UKMFR9: 'www.amazon.de',
    A1VC38T7YXB528: 'www.amazon.co.jp',
    ATVPDKIKX0DER: 'www.amazon.com',
};

export const amazonUrl = (product: { asin: string; marketplaceId: string }) =>
    `https://${amazonHosts[product.marketplaceId] ?? 'www.amazon.com'}/dp/${product.asin}`;
