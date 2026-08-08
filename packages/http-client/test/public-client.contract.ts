import type { PublicRouterInputs, PublicRouterOutputs, RankWranglerClient } from '../src/index';

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
        ? true
        : false;
type Assert<Condition extends true> = Condition;
type ProductSearchInput = PublicRouterInputs['product']['search'];
type ProductGetInput = PublicRouterInputs['product']['get'];
type ProductHistoryInput = PublicRouterInputs['product']['history'];
type ProductOutput = PublicRouterOutputs['product']['get'];
type ProductHistoryOutput = PublicRouterOutputs['product']['history'];
type KeywordGetInput = PublicRouterInputs['keyword']['get'];
type ProductSearchOutput = PublicRouterOutputs['product']['search'];
type ProductSearchMutation = RankWranglerClient['product']['search'];

export type PublicNamespaceContract = Assert<
    Equal<keyof PublicRouterInputs, 'product' | 'keyword'>
>;
export type ProductProcedureContract = Assert<
    Equal<keyof PublicRouterInputs['product'], 'get' | 'search' | 'history'>
>;
export type KeywordProcedureContract = Assert<
    Equal<keyof PublicRouterInputs['keyword'], 'get' | 'search' | 'history'>
>;
export type ProductSearchOutputContract = Assert<
    Equal<Awaited<ReturnType<ProductSearchMutation['mutate']>>, ProductSearchOutput>
>;
export type ProductGetInputContract = Assert<
    Equal<keyof ProductGetInput, 'marketplaceId' | 'asin'>
>;
export type ProductOutputContract = Assert<
    Equal<
        keyof ProductOutput,
        'marketplaceId' | 'asin' | 'listing' | 'category' | 'salesRank' | 'price' | 'demand'
    >
>;
export type ProductHistoryInputContract = Assert<
    Equal<
        keyof ProductHistoryInput,
        'marketplaceId' | 'asin' | 'bucket' | 'days' | 'endAt' | 'limit' | 'metrics' | 'startAt'
    >
>;
export type ProductHistoryOutputContract = Assert<
    Equal<keyof ProductHistoryOutput, 'marketplaceId' | 'asin' | 'range' | 'series'>
>;
export type KeywordGetInputContract = Assert<
    Equal<
        keyof KeywordGetInput,
        'keyword' | 'dataEndDate' | 'dataStartDate' | 'marketplaceId' | 'reportPeriod'
    >
>;

export const productSearchInput: ProductSearchInput = {
    term: 'retro gardening shirt',
};
