/** Which listing a Product page shows: an ASIN in one Amazon marketplace. */
export interface ProductIdentity {
    readonly asin: string;
    readonly marketplaceId: string;
}

/** amazon.com, the marketplace a bare `/products/:asin` link means. */
export const defaultMarketplaceId = 'ATVPDKIKX0DER';
