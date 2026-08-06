import type { PublicRouterInputs, PublicRouterOutputs, RankWranglerClient } from '../src/index';

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
        ? true
        : false;
type Assert<Condition extends true> = Condition;
type ProductSummaryInput = PublicRouterInputs['product']['getSummary'];
type ProductSummaryOutput = PublicRouterOutputs['product']['getSummary'];
type ProductSummaryMutation = RankWranglerClient['product']['getSummary'];

export type ProductSummaryInputContract = Assert<
    Equal<ProductSummaryInput, { marketplaceId: string; asin: string }>
>;
export type ProductSummaryOutputContract = Assert<
    Equal<Awaited<ReturnType<ProductSummaryMutation['mutate']>>, ProductSummaryOutput>
>;

export const productSummaryInput: ProductSummaryInput = {
    marketplaceId: 'ATVPDKIKX0DER',
    asin: 'B0DV53VS61',
};

export const productSummaryOutput: ProductSummaryOutput = {
    asin: productSummaryInput.asin,
    marketplaceId: productSummaryInput.marketplaceId,
    dateFirstAvailable: null,
    title: 'Typed Product summary',
    brand: 'MerchBase',
    isMerchListing: true,
    bullet1: null,
    bullet2: null,
    rootCategoryId: 123,
    rootCategoryBsr: 456,
    rootCategoryDisplayName: 'Clothing',
    thumbnail: { status: 'available', url: 'https://example.com/product.jpg' },
    keepa: null,
    metadata: {
        cached: true,
        updatedAt: '2026-08-06T12:00:00.000Z',
    },
};
